import { formatDate } from "@/lib/format";
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
