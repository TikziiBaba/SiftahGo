// Tüm saatler İstanbul saatiyle gösterilir. Türkiye 2016'dan beri sabit UTC+3 kullanır.
export const TZ = "Europe/Istanbul";
const OFFSET = "+03:00";

/** "YYYY-MM-DD" biçiminde bugünün tarihi (İstanbul). */
export function todayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO gün numarası: 1 = Pazartesi ... 7 = Pazar */
export function isoWeekday(day: string) {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Gün + "HH:mm" -> ISO zaman damgası */
export function toIso(day: string, time: string) {
  return new Date(`${day}T${time.slice(0, 5)}:00${OFFSET}`).toISOString();
}

/** Günün başlangıç ve bitişi (ISO), sorgularda aralık için. */
export function dayBounds(day: string) {
  return { from: toIso(day, "00:00"), to: toIso(addDays(day, 1), "00:00") };
}

export function dayOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function formatDate(isoOrDay: string, opts: Intl.DateTimeFormatOptions = {}) {
  const d = isoOrDay.length === 10 ? new Date(`${isoOrDay}T12:00:00Z`) : new Date(isoOrDay);
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    weekday: "long",
    ...opts,
  }).format(d);
}

export function formatPrice(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(
    Number(n),
  );
}

export function formatDuration(min: number) {
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} saat`;
}

export function slugify(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD") // ç -> c + işaret, ardından işaretler silinir
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** Yazılırken kullanılır: sondaki tireyi silmez ki kullanıcı tire yazabilsin. */
export function slugInput(text: string) {
  const s = slugify(text);
  return s && /[-\s]$/.test(text) ? `${s}-` : s;
}

/** Türk telefon numarasını uluslararası biçime (905xx...) çevirir. */
export function intlPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `9${digits}`;
  return `90${digits}`;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}`;
}

/** Randevu hatırlatma mesajı (işletmeden müşteriye). */
export function reminderText(a: { customer_name: string; starts_at: string; service_name: string }, businessName: string) {
  return `Merhaba ${a.customer_name.split(" ")[0]}, ${formatDate(a.starts_at)} saat ${formatTime(a.starts_at)} için ${businessName} randevunuzu (${a.service_name}) hatırlatmak isteriz. Görüşmek üzere!`;
}

/** Google Takvim'e ekleme bağlantısı. */
export function googleCalendarLink(title: string, startIso: string, endIso: string, location: string) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(startIso)}/${f(endIso)}`, location });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Supabase/Postgres hatasını kullanıcıya gösterilebilir metne çevirir. */
export function errorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return "";
  if (error.code === "23505") return "Bu adres zaten kullanılıyor, başka bir tane deneyin.";
  if (error.code === "23P01") return "Bu personelin o saatte başka bir randevusu var.";
  if (error.code === "23514") return "Girilen bilgilerden biri geçersiz.";
  if (error.message === "Invalid login credentials") return "E-posta veya şifre hatalı.";
  if (error.message?.includes("already registered")) return "Bu e-posta ile zaten bir hesap var.";
  if (error.message?.includes("Password should be")) return "Şifre en az 6 karakter olmalı.";
  if (error.message?.includes("Email not confirmed")) return "E-posta adresinizi henüz doğrulamadınız.";
  return error.message ?? "Bir hata oluştu.";
}
