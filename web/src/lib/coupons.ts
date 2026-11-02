import { dayOf, formatDate, formatTime, isoWeekday } from "@/lib/format";
import type { Coupon } from "@/lib/types";

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

type Discount = Pick<Coupon, "discount_type" | "discount_value">;
type When = Pick<Coupon, "weekdays" | "start_time" | "end_time" | "ends_on">;

/** "%15 indirim" ya da "50 ₺ indirim". */
export function formatDiscount(c: Discount) {
  const n = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(c.discount_value));
  return c.discount_type === "percent" ? `%${n} indirim` : `${n} ₺ indirim`;
}

function dayLabel(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "" || key === "1,2,3,4,5,6,7") return "";
  if (key === "1,2,3,4,5") return "Hafta içi";
  if (key === "6,7") return "Hafta sonu";
  return sorted.map((n) => DAYS[n - 1]).join(", ");
}

/** "Hafta içi 12.00–15.00 · Bitiş: 30 Kasım" (gün ve saat sınırı yoksa yalnızca bitiş). */
export function formatCouponWhen(c: When) {
  const t = (s: string) => s.slice(0, 5).replace(":", ".");
  const parts = [dayLabel(c.weekdays), c.start_time && c.end_time ? `${t(c.start_time)}–${t(c.end_time)}` : ""].filter(Boolean);
  const end = `Bitiş: ${formatDate(c.ends_on, { weekday: undefined })}`;
  return [parts.join(" "), end].filter(Boolean).join(" · ");
}

/** Kuponlu tutarlar kuruşlu olabilir (127,5 ₺): formatPrice tam liraya yuvarlar. */
export function formatMoney(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n));
}

/** İndirimli fiyat (sunucudaki coupon_price ile aynı): yüzde kuruşa yuvarlanır, sabit indirim fiyatı aşarsa 0. */
export function couponPrice(price: number, c: Discount) {
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const v = Number(c.discount_value);
  return c.discount_type === "percent" ? round((price * (100 - v)) / 100) : Math.max(round(price - v), 0);
}

type Rule = Pick<Coupon, "starts_on" | "ends_on" | "weekdays" | "start_time" | "end_time" | "service_ids">;

/** Kupon bu hizmette ve bu saatte (ISO) geçerli mi; yalnızca gösterim için, asıl denetim sunucuda (book_appointment). */
export function couponFits(c: Rule, serviceId: string, startsAt: string) {
  if (c.service_ids.length > 0 && !c.service_ids.includes(serviceId)) return false;
  const day = dayOf(startsAt);
  if (day < c.starts_on || day > c.ends_on) return false;
  if (c.weekdays.length > 0 && !c.weekdays.includes(isoWeekday(day))) return false;
  if (c.start_time && c.end_time) {
    const t = formatTime(startsAt);
    if (t < c.start_time.slice(0, 5) || t >= c.end_time.slice(0, 5)) return false;
  }
  return true;
}
