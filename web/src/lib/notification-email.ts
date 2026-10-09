import { formatDate, formatPrice, formatTime } from "@/lib/format";
import type { AppointmentStatus } from "@/lib/types";

/** claim_notifications satırı */
export type QueuedNotification = {
  id: string;
  kind: "booked" | "confirmed" | "cancelled" | "reminder";
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
};

type Content = {
  subject: string;
  title: string;
  intro: string;
  rows: [string, string][];
  action?: { label: string; href: string };
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
        subject: `Randevunuz iptal edildi: ${n.business_name}`,
        title: "Randevunuz iptal edildi",
        intro: "İşletme bu randevuyu iptal etti. Dilerseniz başka bir saate yeni randevu alabilirsiniz.",
        rows: forCustomer,
        action: { label: "Yeni randevu al", href: `${appUrl}/${n.business_slug}` },
      };
    case "reminder":
      return {
        subject: `Hatırlatma: ${n.business_name}, ${when}`,
        title: "Randevunuzu hatırlatırız",
        intro: `Merhaba ${n.customer_name.split(" ")[0]}, randevunuz yaklaşıyor. Gelemeyecekseniz lütfen işletmeye haber verin.`,
        rows: forCustomer,
        action: businessPage,
      };
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildEmail(n: QueuedNotification, appUrl: string) {
  const c = content(n, appUrl);
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
<p style="margin:16px 0 0;text-align:center;font-size:12px;color:#9ca3af">Bu e-posta SiftahGo üzerinden alınan randevu için gönderildi.</p>
</div></body></html>`;
  const text = [
    c.title,
    "",
    c.intro,
    "",
    ...c.rows.map(([k, v]) => `${k}: ${v}`),
    ...(c.action ? ["", `${c.action.label}: ${c.action.href}`] : []),
  ].join("\n");
  return { to: n.email, subject: c.subject, html, text };
}
