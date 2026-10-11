// Tüm saatler İstanbul saatiyle (sabit UTC+3) gösterilir. Intl'e güvenmeden
// elle hesaplıyoruz; Hermes'in Intl desteği platforma göre değişebiliyor.
const OFFSET_MS = 3 * 60 * 60 * 1000;
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
// İlk üç harf Cuma/Cumartesi ve Pazar/Pazartesi'yi ayırmıyor.
const SHORT_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const local = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" biçiminde bugünün tarihi (İstanbul). */
export function todayStr() {
  return new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10);
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
  return new Date(`${day}T${time.slice(0, 5)}:00+03:00`).toISOString();
}

/** ISO zamanın İstanbul'daki günü ("YYYY-MM-DD") */
export function dayOf(iso: string) {
  return local(iso).toISOString().slice(0, 10);
}

/** Zamanı geçti mi (randevu ertelenebilir mi gibi kontroller için) */
export function isPast(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

export function dayBounds(day: string) {
  return { from: toIso(day, '00:00'), to: toIso(addDays(day, 1), '00:00') };
}

export function formatTime(iso: string) {
  const d = local(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDate(isoOrDay: string, withWeekday = true) {
  const d = isoOrDay.length === 10 ? new Date(`${isoOrDay}T12:00:00Z`) : local(isoOrDay);
  const text = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${text} ${DAYS[d.getUTCDay()]}` : text;
}

/** "Bugün", "Yarın", "Dün" veya "12 Ekim Cumartesi" */
export function relativeDay(day: string) {
  const today = todayStr();
  if (day === today) return 'Bugün';
  if (day === addDays(today, 1)) return 'Yarın';
  if (day === addDays(today, -1)) return 'Dün';
  return formatDate(day);
}

export function shortDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return { weekday: SHORT_DAYS[d.getUTCDay()], date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()].slice(0, 3) };
}

export function formatPrice(n: number) {
  return `₺${Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function formatDuration(min: number) {
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} saat`;
}

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Web'deki slugify ile aynı sonucu verir (Hermes'te Unicode regex'e güvenmeden). */
export function slugify(text: string) {
  return text
    .replace(/[İI]/g, 'i')
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

/** Yazılırken kullanılır: sondaki tireyi silmez ki kullanıcı tire yazabilsin. */
export function slugInput(text: string) {
  const s = slugify(text);
  return s && /[-\s]$/.test(text) ? `${s}-` : s;
}

export function errorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return '';
  if (error.code === '23505') return 'Bu adres zaten kullanılıyor, başka bir tane deneyin.';
  if (error.code === '23P01') return 'Bu personelin o saatte başka bir randevusu var.';
  if (error.code === '23514') return 'Girilen bilgilerden biri geçersiz.';
  if (error.message === 'Invalid login credentials') return 'E-posta veya şifre hatalı.';
  if (error.message?.includes('already registered')) return 'Bu e-posta ile zaten bir hesap var.';
  if (error.message?.includes('Password should be')) return 'Şifre en az 6 karakter olmalı.';
  if (error.message?.includes('Email not confirmed')) return 'E-posta adresinizi henüz doğrulamadınız.';
  if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
    return 'İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }
  return error.message ?? 'Bir hata oluştu.';
}

/** Türk telefon numarasını uluslararası biçime (905xx...) çevirir. */
export function intlPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `9${digits}`;
  return `90${digits}`;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}`;
}

export function reminderText(a: { customer_name: string; starts_at: string; service_name: string }, businessName: string) {
  return `Merhaba ${a.customer_name.split(' ')[0]}, ${formatDate(a.starts_at)} saat ${formatTime(a.starts_at)} için ${businessName} randevunuzu (${a.service_name}) hatırlatmak isteriz. Görüşmek üzere!`;
}

export function googleCalendarLink(title: string, startIso: string, endIso: string, location: string) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${f(startIso)}/${f(endIso)}&location=${encodeURIComponent(location)}`;
}

export function mapsLink(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
