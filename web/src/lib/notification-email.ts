import { formatDate, formatPrice, formatTime } from "@/lib/format";
import type { WaitlistNotice } from "@/lib/push";
import type { AppointmentStatus } from "@/lib/types";

/** claim_notifications satırı */
export type QueuedNotification = {
  id: string;
  kind: "booked" | "confirmed" | "cancelled" | "rescheduled" | "reminder" | "reminder_soon" | "review";
  recipient: "customer" | "business";
  email: string;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  note: string;
  price: number;
  starts_at: string;
  status: AppointmentStatus;
  business_name: string;
  business_slug: string;
  business_phone: string;
  business_address: string;
  prior_cancels: number;
  prior_no_shows: number;
  customer_flagged: boolean;
  // İşletmenin iptal/ret açıklaması; rejected: onay bekleyen randevu reddedildi
  cancel_reason: string;
  rejected: boolean;
};

type Content = {
  subject: string;
  title: string;
  intro: string;
  rows: [string, string][];
  action?: { label: string; href: string };
  footer?: string;
};

function content(n: QueuedNotification, appUrl: string): Content {
  const when = `${formatDate(n.starts_at)}, ${formatTime(n.starts_at)}`;
  const businessPage = { label: "İşletme sayfası", href: `${appUrl}/${n.business_slug}` };
  const forCustomer: [string, string][] = [
    ["İşletme", n.business_name],
    ["Hizmet", n.service_name],
    ["Tarih", when],
    ...(n.business_address ? [["Adres", n.business_address] as [string, string]] : []),
    ...(n.business_phone ? [["Telefon", n.business_phone] as [string, string]] : []),
  ];
  const forBusiness: [string, string][] = [
    ["Müşteri", n.customer_name],
    ["Telefon", n.customer_phone],
    ["Hizmet", n.service_name],
    ["Tarih", when],
    ...(Number(n.price) > 0 ? [["Ücret", formatPrice(n.price)] as [string, string]] : []),
    ...(n.note ? [["Not", n.note] as [string, string]] : []),
  ];
  const panel = { label: "Panelde aç", href: `${appUrl}/panel` };

  if (n.recipient === "business") {
    if (n.kind === "cancelled") {
      return {
        subject: `Randevu iptal edildi: ${n.customer_name}, ${when}`,
        title: "Randevu iptal edildi",
        intro: `${n.customer_name} randevusunu iptal etti. Saat tekrar randevuya açıldı.`,
        rows: forBusiness,
        action: panel,
      };
    }
    const pending = n.status === "pending";
    if (n.kind === "booked" && n.customer_flagged) {
      const history = `Son 6 ayda ${n.prior_cancels} iptal, ${n.prior_no_shows} gelmedi`;
      return {
        subject: `Dikkat, sık iptal eden müşteri: ${n.customer_name}, ${when}`,
        title: "Sık iptal eden müşteriden randevu",
        intro: pending
          ? `${n.customer_name} son 6 ayda ${n.prior_cancels} randevusunu iptal etti, ${n.prior_no_shows} randevusuna gelmedi. Bu yüzden randevu otomatik onaylanmadı; panelden onaylayın veya reddedin.`
          : `${n.customer_name} son 6 ayda ${n.prior_cancels} randevusunu iptal etti, ${n.prior_no_shows} randevusuna gelmedi. Randevudan önce aramanızı öneririz.`,
        rows: [...forBusiness, ["Geçmiş", history]],
        action: panel,
      };
    }
    if (n.kind === "rescheduled") {
      return {
        subject: `${pending ? "Saat değişikliği onay bekliyor" : "Randevu saati değişti"}: ${n.customer_name}, ${when}`,
        title: pending ? "Saat değişikliği onay bekliyor" : "Randevu saati değişti",
        intro: pending
          ? `${n.customer_name} randevusunu yeni bir saate aldı. Panelden onaylayın ki müşteriye bildirim gitsin.`
          : `${n.customer_name} randevusunu yeni bir saate aldı. Eski saat tekrar randevuya açıldı.`,
        rows: forBusiness,
        action: panel,
      };
    }
    return {
      subject: `${pending ? "Onay bekleyen randevu" : "Yeni randevu"}: ${n.customer_name}, ${when}`,
      title: pending ? "Onay bekleyen randevu" : "Yeni randevu",
      intro: pending
        ? "Yeni bir randevu talebi var. Panelden onaylayın ki müşteriye bildirim gitsin."
        : "Online randevu sayfanızdan yeni bir randevu alındı.",
      rows: forBusiness,
      action: panel,
    };
  }

  switch (n.kind) {
    case "booked":
      return n.status === "pending"
        ? {
            subject: `Randevu talebiniz alındı: ${n.business_name}`,
            title: "Randevu talebiniz alındı",
            intro: "İşletme randevunuzu onayladığında size tekrar e-posta göndereceğiz.",
            rows: forCustomer,
            action: businessPage,
          }
        : {
            subject: `Randevunuz onaylandı: ${n.business_name}, ${when}`,
            title: "Randevunuz onaylandı",
            intro: "Randevunuz kesinleşti. Gelemeyecekseniz lütfen işletmeye haber verin.",
            rows: forCustomer,
            action: businessPage,
          };
    case "confirmed":
      return {
        subject: `Randevunuz onaylandı: ${n.business_name}, ${when}`,
        title: "Randevunuz onaylandı",
        intro: "İşletme randevunuzu onayladı. Gelemeyecekseniz lütfen işletmeye haber verin.",
        rows: forCustomer,
        action: businessPage,
      };
    case "cancelled":
      return {
        subject: `${n.rejected ? "Randevu talebiniz onaylanmadı" : "Randevunuz iptal edildi"}: ${n.business_name}`,
        title: n.rejected ? "Randevu talebiniz onaylanmadı" : "Randevunuz iptal edildi",
        intro: `${n.rejected ? "İşletme bu randevu talebini onaylamadı." : "İşletme bu randevuyu iptal etti."} Dilerseniz başka bir saate yeni randevu alabilirsiniz.`,
        rows: [...forCustomer, ...(n.cancel_reason ? [["İşletmenin açıklaması", n.cancel_reason] as [string, string]] : [])],
        action: { label: "Yeni randevu al", href: `${appUrl}/${n.business_slug}` },
      };
    case "rescheduled":
      return {
        subject: `Randevunuzun saati değişti: ${n.business_name}, ${when}`,
        title: "Randevunuzun saati değişti",
        intro: "İşletme randevunuzu aşağıdaki yeni saate aldı. Bu saat size uymuyorsa lütfen işletmeye haber verin.",
        rows: forCustomer,
        action: businessPage,
      };
    case "review":
      return {
        subject: `${n.business_name} nasıldı?`,
        title: "Hizmet nasıldı?",
        intro: `Merhaba ${n.customer_name.split(" ")[0]}, ${n.business_name} randevunuz için birkaç saniyelik bir değerlendirme bırakır mısınız? Puanınız diğer müşterilere yol gösterir.`,
        rows: [
          ["İşletme", n.business_name],
          ["Hizmet", n.service_name],
          ["Tarih", when],
        ],
        action: { label: "Değerlendir", href: `${appUrl}/hesabim` },
      };
    case "reminder":
      return {
        subject: `Hatırlatma: ${n.business_name}, ${when}`,
        title: "Randevunuzu hatırlatırız",
        intro: `Merhaba ${n.customer_name.split(" ")[0]}, randevunuz yaklaşıyor. Gelemeyecekseniz lütfen işletmeye haber verin.`,
        rows: forCustomer,
        action: businessPage,
      };
    case "reminder_soon":
      return {
        subject: `2 saat sonra: ${n.business_name}, ${when}`,
        title: "Randevunuza az kaldı",
        intro: `Merhaba ${n.customer_name.split(" ")[0]}, randevunuz yaklaşık 2 saat sonra. Gelemeyecekseniz lütfen hemen işletmeye haber verin.`,
        rows: forCustomer,
        action: businessPage,
      };
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildEmail(n: QueuedNotification, appUrl: string) {
  return render(n.email, content(n, appUrl));
}

/** Bekleme listesindeki müşteriye: beklediği günde saat boşaldı. */
export function buildWaitlistEmail(n: WaitlistNotice & { email: string }, appUrl: string) {
  const day = formatDate(n.day);
  return render(n.email, {
    subject: `Saat boşaldı: ${n.business_name}, ${day}`,
    title: "Beklediğiniz günde saat boşaldı",
    intro: `Merhaba ${n.customer_name.split(" ")[0]}, bekleme listesine yazıldığınız gün için bir saat boşaldı. İlk alan kapar, hemen bakın.`,
    rows: [
      ["İşletme", n.business_name],
      ["Gün", day],
    ],
    action: { label: "Boş saatleri gör", href: `${appUrl}/${n.business_slug}?gun=${n.day}#randevu` },
    footer: "Bu e-posta SiftahGo bekleme listesine yazıldığınız için gönderildi.",
  });
}

function render(to: string, c: Content) {
  const rows = c.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("");
  const button = c.action
    ? `<p style="margin:24px 0 0"><a href="${esc(c.action.href)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">${esc(c.action.label)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-weight:800;color:#0f766e">SiftahGo</p>
<h1 style="margin:0 0 8px;font-size:20px;color:#111827">${esc(c.title)}</h1>
<p style="margin:0 0 20px;color:#374151;line-height:1.5">${esc(c.intro)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows}</table>
${button}
</div>
<p style="margin:16px 0 0;text-align:center;font-size:12px;color:#9ca3af">${esc(c.footer ?? "Bu e-posta SiftahGo üzerinden alınan randevu için gönderildi.")}</p>
</div></body></html>`;
  const text = [
    c.title,
    "",
    c.intro,
    "",
    ...c.rows.map(([k, v]) => `${k}: ${v}`),
    ...(c.action ? ["", `${c.action.label}: ${c.action.href}`] : []),
  ].join("\n");
  return { to, subject: c.subject, html, text };
}
