import { emailConfigured, sendEmail } from "@/lib/email";
import { buildEmail, type QueuedNotification } from "@/lib/notification-email";
import { createAdminClient } from "@/lib/supabase/admin";

// Kuyruktaki randevu e-postalarını gönderir. Zamanlanmış görev (Supabase pg_cron)
// dakikada bir "Authorization: Bearer CRON_SECRET" başlığıyla çağırır.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!emailConfigured()) {
    return Response.json({ error: "RESEND_API_KEY ve EMAIL_FROM tanımlı değil." }, { status: 503 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const { data: reminders, error: queueError } = await supabase.rpc("queue_due_reminders");
  if (queueError) console.error("Hatırlatmalar kuyruğa eklenemedi", queueError.message);

  const { data, error } = await supabase.rpc("claim_notifications", { p_limit: 20 });
  if (error) {
    console.error("Bildirim kuyruğu okunamadı", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const [i, n] of (data as QueuedNotification[]).entries()) {
    // Resend ücretsiz katmanı saniyede 2 istek kabul eder.
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    let sendError: string | null = null;
    try {
      await sendEmail(n.id, buildEmail(n, appUrl));
      sent++;
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
      console.error("E-posta gönderilemedi", n.id, sendError);
      failed++;
    }
    await supabase.rpc("finish_notification", { p_id: n.id, p_error: sendError });
  }

  return Response.json({ reminders: reminders ?? 0, sent, failed });
}
