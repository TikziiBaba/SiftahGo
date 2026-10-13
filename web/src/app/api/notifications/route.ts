import { emailConfigured, sendEmail } from "@/lib/email";
import { buildEmail, buildWaitlistEmail, type QueuedNotification } from "@/lib/notification-email";
import { sendQueuedPushes, sendWaitlistPushes, type WaitlistNotice } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

// Kuyruktaki randevu bildirimlerini (anlık bildirim ve e-posta) gönderir. Zamanlanmış görev
// (Supabase pg_cron) dakikada bir "Authorization: Bearer CRON_SECRET" başlığıyla çağırır.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const { data: reminders, error: queueError } = await supabase.rpc("queue_due_reminders");
  if (queueError) console.error("Hatırlatmalar kuyruğa eklenemedi", queueError.message);
  const { data: reviewRequests, error: reviewError } = await supabase.rpc("queue_review_requests");
  if (reviewError) console.error("Değerlendirme istekleri kuyruğa eklenemedi", reviewError.message);

  // E-postalar yavaş gönderildiği için anlık bildirimler önce gider.
  const push = await sendQueuedPushes(supabase).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Anlık bildirim kuyruğu okunamadı", message);
    return { error: message };
  });

  // Bekleme listesi: beklenen günde saat boşaldı. Alınan haber tekrar denenmez.
  const { data: waitlistData, error: waitlistError } = await supabase.rpc("claim_waitlist");
  if (waitlistError) console.error("Bekleme listesi haberleri alınamadı", waitlistError.message);
  const waitlist = (waitlistData ?? []) as WaitlistNotice[];
  const waitlistPush = await sendWaitlistPushes(supabase, waitlist);

  if (!emailConfigured()) {
    return Response.json({ push, waitlistPush, error: "RESEND_API_KEY ve EMAIL_FROM tanımlı değil." }, { status: 503 });
  }

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

  for (const w of waitlist) {
    if (!w.email) continue;
    if (sent + failed > 0) await new Promise((r) => setTimeout(r, 600));
    try {
      await sendEmail(`waitlist-${w.id}-${Date.now()}`, buildWaitlistEmail({ ...w, email: w.email }, appUrl));
      sent++;
    } catch (e) {
      console.error("Bekleme listesi e-postası gönderilemedi", w.id, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  return Response.json({
    reminders: reminders ?? 0,
    reviewRequests: reviewRequests ?? 0,
    waitlist: waitlist.length,
    sent,
    failed,
    push,
    waitlistPush,
  });
}
