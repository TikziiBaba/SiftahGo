import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** claim_push satırı */
type QueuedPush = {
  id: string;
  kind: "booked" | "confirmed" | "cancelled" | "rescheduled" | "reminder" | "review" | "reviewed";
  recipient: "customer" | "business";
  appointment_id: string;
  title: string;
  body: string;
  tokens: string[];
};

type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

// Expo tek istekte en fazla 100 mesaj kabul eder.
const BATCH = 100;

/**
 * Kuyruktaki anlık bildirimleri Expo Push API ile telefonlara gönderir
 * (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Telefonlardan birine ulaşan bildirim gönderilmiş sayılır; uygulamayı kaldıranların adresleri silinir.
 */
export async function sendQueuedPushes(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("claim_push", { p_limit: 50 });
  if (error) throw new Error(error.message);
  const queued = data as QueuedPush[];

  const messages = queued.flatMap((p) =>
    p.tokens.map((to) => ({
      pushId: p.id,
      message: {
        to,
        title: p.title,
        body: p.body,
        data: { inboxId: p.id, kind: p.kind, recipient: p.recipient, appointmentId: p.appointment_id },
        sound: "default",
        channelId: "default",
        priority: "high",
      },
    })),
  );

  const delivered = new Set<string>();
  const errors = new Map<string, string>();
  const dead: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    let tickets: Ticket[];
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(batch.map((m) => m.message)),
      });
      if (!res.ok) throw new Error(`Expo ${res.status}: ${await res.text()}`);
      tickets = (await res.json()).data;
    } catch (e) {
      for (const m of batch) errors.set(m.pushId, e instanceof Error ? e.message : String(e));
      continue;
    }
    // Biletler mesajlarla aynı sırada gelir.
    tickets.forEach((t, j) => {
      const m = batch[j];
      if (t.status === "ok") {
        delivered.add(m.pushId);
      } else {
        if (t.details?.error === "DeviceNotRegistered") dead.push(m.message.to);
        errors.set(m.pushId, t.details?.error ?? t.message);
      }
    });
  }

  if (dead.length) await supabase.rpc("drop_push_tokens", { p_tokens: dead });

  let sent = 0;
  let failed = 0;
  for (const p of queued) {
    const pushError = delivered.has(p.id) ? null : (errors.get(p.id) ?? "Gönderilemedi");
    if (pushError) {
      console.error("Anlık bildirim gönderilemedi", p.id, pushError);
      failed++;
    } else sent++;
    await supabase.rpc("finish_push", { p_id: p.id, p_error: pushError });
  }
  return { sent, failed };
}
