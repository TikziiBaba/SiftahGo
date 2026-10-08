// Tüm saatler İstanbul saatiyle (sabit UTC+3) gösterilir. Intl'e güvenmeden
// elle hesaplıyoruz; Hermes'in Intl desteği platforma göre değişebiliyor.
const OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

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

export function dayBounds(day: string) {
  return {
    from: new Date(`${day}T00:00:00+03:00`).toISOString(),
    to: new Date(`${addDays(day, 1)}T00:00:00+03:00`).toISOString(),
  };
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

export function shortDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return { weekday: DAYS[d.getUTCDay()].slice(0, 3), date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()].slice(0, 3) };
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

export function errorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return '';
  if (error.code === '23P01') return 'Bu personelin o saatte başka bir randevusu var.';
  if (error.message === 'Invalid login credentials') return 'E-posta veya şifre hatalı.';
  if (error.message?.includes('already registered')) return 'Bu e-posta ile zaten bir hesap var.';
  if (error.message?.includes('Password should be')) return 'Şifre en az 6 karakter olmalı.';
  if (error.message?.includes('Email not confirmed')) return 'E-posta adresinizi henüz doğrulamadınız.';
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
