import { timingSafeEqual } from "node:crypto";
import { COMPANY } from "@/lib/company";
import { emailConfigured, sendEmail } from "@/lib/email";
import {
  buildBirthdayEmail,
  buildCouponReviewNoticeEmail,
  buildCouponReviewRequestEmail,
  buildDelayEmail,
  buildEmail,
  buildSupportEmail,
  buildWaitlistEmail,
  type QueuedNotification,
  type QueuedSupportEmail,
} from "@/lib/notification-email";
import {
  sendBirthdayGiftPushes,
  sendCouponReviewNoticePushes,
  sendCouponReviewRequestPushes,
  sendDelayPushes,
  sendQueuedPushes,
  sendWaitlistPushes,
  type BirthdayGift,
  type CouponReviewNotice,
  type CouponReviewRequest,
  type DelayNotice,
  type WaitlistNotice,
} from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

// Kuyruktaki randevu bildirimlerini (anlık bildirim ve e-posta) gönderir. Zamanlanmış görev
// (Supabase pg_cron) dakikada bir "Authorization: Bearer CRON_SECRET" başlığıyla çağırır.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Sabit sürede karşılaştırılır: yanıt süresinden anahtar tahmin edilemesin.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const { error: liftError } = await supabase.rpc("lift_due_suspensions");
  if (liftError) console.error("Süresi dolan askılar kaldırılamadı", liftError.message);

  const { data: reminders, error: queueError } = await supabase.rpc("queue_due_reminders");
  if (queueError) console.error("Hatırlatmalar kuyruğa eklenemedi", queueError.message);
  const { data: reviewRequests, error: reviewError } = await supabase.rpc("queue_review_requests");
  if (reviewError) console.error("Değerlendirme istekleri kuyruğa eklenemedi", reviewError.message);
  const { data: rebooks, error: rebookError } = await supabase.rpc("queue_rebook_reminders");
  if (rebookError) console.error("Zamanı geldi hatırlatmaları kuyruğa eklenemedi", rebookError.message);

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

  // Gecikme haberi: müşteri "geç kalacağım" ya da işletme "gecikmemiz var" dedi. Alınan haber tekrar denenmez.
  const { data: delayData, error: delayError } = await supabase.rpc("claim_delay_notices", { p_limit: 50 });
  if (delayError) console.error("Gecikme haberleri alınamadı", delayError.message);
  const delays = (delayData ?? []) as DelayNotice[];
  const delayPush = await sendDelayPushes(supabase, delays);

  // Vitrin kupon yorumları: müşteriye "Nasıldı?", esnafa "Yeni değerlendirme". Alınan haber tekrar denenmez.
  const { data: reviewRequestData, error: reviewRequestError } = await supabase.rpc("claim_coupon_review_requests", { p_limit: 50 });
  if (reviewRequestError) console.error("Kupon değerlendirme istekleri alınamadı", reviewRequestError.message);
  const couponRequests = (reviewRequestData ?? []) as CouponReviewRequest[];
  const { data: reviewNoticeData, error: reviewNoticeError } = await supabase.rpc("claim_coupon_review_notices", { p_limit: 50 });
  if (reviewNoticeError) console.error("Kupon yorum haberleri alınamadı", reviewNoticeError.message);
  const reviewNotices = (reviewNoticeData ?? []) as CouponReviewNotice[];
  const couponReviewPush = {
    requests: await sendCouponReviewRequestPushes(supabase, couponRequests),
    notices: await sendCouponReviewNoticePushes(supabase, reviewNotices),
  };

  // Doğum günü kuponu: kupon üretilip müşteriye haber verilir. Alınan haber tekrar denenmez.
  const { data: birthdayData, error: birthdayError } = await supabase.rpc("claim_birthday_gifts", { p_limit: 50 });
  if (birthdayError) console.error("Doğum günü kuponları üretilemedi", birthdayError.message);
  const birthdays = (birthdayData ?? []) as BirthdayGift[];
  const birthdayPush = await sendBirthdayGiftPushes(supabase, birthdays);

  if (!emailConfigured()) {
    return Response.json({ push, waitlistPush, delayPush, couponReviewPush, birthdayPush, error: "RESEND_API_KEY ve EMAIL_FROM tanımlı değil." }, { status: 503 });
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

  for (const d of delays) {
    if (d.recipient !== "customer" || !d.email) continue;
    if (sent + failed > 0) await new Promise((r) => setTimeout(r, 600));
    try {
      await sendEmail(`delay-${d.id}`, buildDelayEmail({ ...d, email: d.email }, appUrl));
      sent++;
    } catch (e) {
      console.error("Gecikme e-postası gönderilemedi", d.id, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  for (const r of couponRequests) {
    if (!r.email) continue;
    if (sent + failed > 0) await new Promise((res) => setTimeout(res, 600));
    try {
      await sendEmail(`coupon-review-request-${r.id}`, buildCouponReviewRequestEmail({ ...r, email: r.email }, appUrl));
      sent++;
    } catch (e) {
      console.error("Kupon değerlendirme e-postası gönderilemedi", r.id, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  for (const r of reviewNotices) {
    if (!r.email) continue;
    if (sent + failed > 0) await new Promise((res) => setTimeout(res, 600));
    try {
      await sendEmail(`coupon-review-notice-${r.id}`, buildCouponReviewNoticeEmail({ ...r, email: r.email }, appUrl));
      sent++;
    } catch (e) {
      console.error("Kupon yorum e-postası gönderilemedi", r.id, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  for (const g of birthdays) {
    if (!g.email) continue;
    if (sent + failed > 0) await new Promise((res) => setTimeout(res, 600));
    try {
      await sendEmail(`birthday-${g.id}`, buildBirthdayEmail({ ...g, email: g.email }, appUrl));
      sent++;
    } catch (e) {
      console.error("Doğum günü e-postası gönderilemedi", g.id, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  // Destek talepleri: kullanıcının mesajı destek adresine, ekibin yanıtı kullanıcıya.
  const { data: supportData, error: supportError } = await supabase.rpc("claim_support_emails", { p_limit: 10 });
  if (supportError) console.error("Destek e-postaları alınamadı", supportError.message);
  const support = (supportData ?? []) as QueuedSupportEmail[];
  for (const s of support) {
    if (sent + failed > 0) await new Promise((r) => setTimeout(r, 600));
    let sendError: string | null = null;
    try {
      await sendEmail(`support-${s.id}`, buildSupportEmail(s, appUrl, COMPANY.email));
      sent++;
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
      console.error("Destek e-postası gönderilemedi", s.id, sendError);
      failed++;
    }
    await supabase.rpc("finish_support_email", { p_id: s.id, p_error: sendError });
  }

  return Response.json({
    reminders: reminders ?? 0,
    reviewRequests: reviewRequests ?? 0,
    rebooks: rebooks ?? 0,
    birthdays: birthdays.length,
    waitlist: waitlist.length,
    delays: delays.length,
    couponReviewRequests: couponRequests.length,
    couponReviewNotices: reviewNotices.length,
    support: support.length,
    sent,
    failed,
    push,
    waitlistPush,
    delayPush,
    couponReviewPush,
    birthdayPush,
  });
}
