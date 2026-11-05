import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatTime } from "@/lib/format";

/** claim_push satırı */
type QueuedPush = {
  id: string;
  kind: "booked" | "confirmed" | "cancelled" | "rescheduled" | "reminder" | "review" | "reviewed" | "rebook";
  recipient: "customer" | "business";
  appointment_id: string;
  title: string;
  body: string;
  tokens: string[];
};

/** claim_waitlist satırı: bekleme listesindeki müşteriye boşalan saat haberi */
export type WaitlistNotice = {
  id: string;
  day: string;
  email: string | null;
  customer_name: string;
  business_name: string;
  business_slug: string;
  tokens: string[];
};

/** claim_delay_notices satırı: gecikme haberi (business: müşteri gecikiyor, customer: işletme gecikiyor) */
export type DelayNotice = {
  id: string;
  recipient: "customer" | "business";
  minutes: number;
  email: string | null;
  customer_name: string;
  business_name: string;
  business_slug: string;
  service_name: string;
  starts_at: string;
  tokens: string[];
};

/** claim_coupon_review_requests satırı: vitrin müşterisine "Nasıldı?" (id kupon kodu satırı) */
export type CouponReviewRequest = {
  id: string;
  email: string | null;
  customer_name: string;
  business_name: string;
  business_slug: string;
  tokens: string[];
};

/** claim_birthday_gifts satırı: müşteriye üretilen doğum günü kuponu (id kupon) */
export type BirthdayGift = {
  id: string;
  email: string | null;
  customer_name: string;
  business_name: string;
  business_slug: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  ends_on: string;
  tokens: string[];
};

/** claim_coupon_review_notices satırı: vitrin esnafına yeni kupon yorumu (id yorum) */
export type CouponReviewNotice = {
  id: string;
  email: string | null;
  rating: number;
  comment: string;
  customer_name: string;
  business_name: string;
  business_slug: string;
  tokens: string[];
};

type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };
type Message = { to: string; title: string; body: string; data: Record<string, unknown> };

// Expo tek istekte en fazla 100 mesaj kabul eder.
const BATCH = 100;

/** Expo Push API'ye gönderir; biletler mesajlarla aynı sırada döner. */
async function postToExpo(batch: Message[]): Promise<Ticket[]> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(batch.map((m) => ({ ...m, sound: "default", channelId: "default", priority: "high" }))),
  });
  if (!res.ok) throw new Error(`Expo ${res.status}: ${await res.text()}`);
  return (await res.json()).data;
}

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
      tickets = await postToExpo(batch.map((m) => m.message));
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

/**
 * Boşalan saat haberini bekleme listesindeki müşterilerin telefonlarına gönderir. Tekrar denenmez;
 * dokununca uygulama işletme sayfasını o gün seçili açar (eski sürüm Randevularım'ı açar).
 */
export async function sendWaitlistPushes(supabase: SupabaseClient, notices: WaitlistNotice[]) {
  const messages: Message[] = notices.flatMap((n) =>
    n.tokens.map((to) => ({
      to,
      title: "Beklediğiniz günde saat boşaldı",
      body: `${n.business_name} · ${formatDate(n.day)} · İlk alan kapar`,
      data: { kind: "waitlist", recipient: "customer", slug: n.business_slug, day: n.day },
    })),
  );
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const tickets = await postToExpo(batch);
      tickets.forEach((t, j) => {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[j].to);
      });
    } catch (e) {
      console.error("Bekleme listesi bildirimi gönderilemedi", e instanceof Error ? e.message : String(e));
    }
  }
  if (dead.length) await supabase.rpc("drop_push_tokens", { p_tokens: dead });
  return { sent };
}

/**
 * Gecikme haberini işletme sahibinin (müşteri gecikiyor) ya da müşterinin (işletme gecikiyor) telefonuna
 * gönderir. Tekrar denenmez; dokununca esnaf takvime, müşteri Randevularım'a düşer.
 */
export async function sendDelayPushes(supabase: SupabaseClient, notices: DelayNotice[]) {
  const messages: Message[] = notices.flatMap((n) => {
    const time = formatTime(n.starts_at);
    const forBusiness = n.recipient === "business";
    return (n.tokens ?? []).map((to) => ({
      to,
      title: forBusiness ? "Müşteri gecikiyor" : "Randevunuzda gecikme var",
      body: forBusiness
        ? `${n.customer_name} · ${time} randevusuna yaklaşık ${n.minutes} dk gecikecek`
        : `${n.business_name} · ${time} randevunuz yaklaşık ${n.minutes} dk gecikebilir`,
      data: { kind: "delay", recipient: n.recipient, startsAt: n.starts_at },
    }));
  });
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const tickets = await postToExpo(batch);
      tickets.forEach((t, j) => {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[j].to);
      });
    } catch (e) {
      console.error("Gecikme bildirimi gönderilemedi", e instanceof Error ? e.message : String(e));
    }
  }
  if (dead.length) await supabase.rpc("drop_push_tokens", { p_tokens: dead });
  return { sent };
}

async function sendMessages(supabase: SupabaseClient, messages: Message[], label: string) {
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const tickets = await postToExpo(batch);
      tickets.forEach((t, j) => {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[j].to);
      });
    } catch (e) {
      console.error(`${label} gönderilemedi`, e instanceof Error ? e.message : String(e));
    }
  }
  if (dead.length) await supabase.rpc("drop_push_tokens", { p_tokens: dead });
  return { sent };
}

/**
 * Vitrin müşterisine "Nasıldı?" gönderir. Tekrar denenmez. Dokununca kupon listesi açılır (kind "coupon_review");
 * türü tanımayan eski uygulamalar müşteri randevuları ekranını açar.
 */
export function sendCouponReviewRequestPushes(supabase: SupabaseClient, notices: CouponReviewRequest[]) {
  return sendMessages(
    supabase,
    notices.flatMap((n) =>
      (n.tokens ?? []).map((to) => ({
        to,
        title: "Nasıldı?",
        body: `${n.business_name} · Kuponunuzu kullandınız, puan vermek için dokunun`,
        data: { kind: "coupon_review", recipient: "customer", slug: n.business_slug },
      })),
    ),
    "Kupon değerlendirme isteği",
  );
}

/**
 * Doğum günü kuponu haberi. Tekrar denenmez; kupon "Kuponlarım"da kalır. Dokununca kupon listesi açılır
 * (kind "birthday"); türü tanımayan eski uygulamalar müşteri randevuları ekranını açar.
 */
export function sendBirthdayGiftPushes(supabase: SupabaseClient, gifts: BirthdayGift[]) {
  return sendMessages(
    supabase,
    gifts.flatMap((g) => {
      const discount = g.discount_type === "percent" ? `%${Number(g.discount_value)}` : `${Number(g.discount_value)} ₺`;
      return (g.tokens ?? []).map((to) => ({
        to,
        title: "Doğum gününüz kutlu olsun!",
        body: `${g.business_name} size ${discount} indirim hediye etti`,
        data: { kind: "birthday", recipient: "customer", slug: g.business_slug },
      }));
    }),
    "Doğum günü kuponu bildirimi",
  );
}

/** Vitrin esnafına "Yeni değerlendirme" gönderir; dokununca Yorumlar açılır (kind "reviewed"). */
export function sendCouponReviewNoticePushes(supabase: SupabaseClient, notices: CouponReviewNotice[]) {
  return sendMessages(
    supabase,
    notices.flatMap((n) =>
      (n.tokens ?? []).map((to) => ({
        to,
        title: `Yeni değerlendirme: ${"★".repeat(n.rating)}${"☆".repeat(5 - n.rating)}`,
        body: [n.customer_name, n.comment.slice(0, 120)].filter(Boolean).join(" · "),
        data: { kind: "reviewed", recipient: "business" },
      })),
    ),
    "Kupon yorumu bildirimi",
  );
}
