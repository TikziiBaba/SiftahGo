import type { AppointmentStatus } from './types';

export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://siftahgo.com';

export const colors = {
  brand: '#0f766e',
  brandDark: '#115e59',
  brandLight: '#f0fdfa',
  brandSoft: '#ccfbf1',
  bg: '#fafaf9',
  card: '#ffffff',
  border: '#e7e5e4',
  text: '#1c1917',
  muted: '#78716c',
  danger: '#e11d48',
};

// Web ile aynı liste (web/src/lib/constants.ts).
export const CATEGORIES = [
  { id: 'berber', label: 'Berber' },
  { id: 'kuafor', label: 'Kuaför' },
  { id: 'guzellik', label: 'Güzellik Salonu' },
  { id: 'tirnak', label: 'Tırnak & Kirpik' },
  { id: 'spa', label: 'Spa & Masaj' },
  { id: 'dovme', label: 'Dövme & Piercing' },
  { id: 'oto-yikama', label: 'Oto Yıkama' },
  { id: 'oto-servis', label: 'Oto Servis' },
  { id: 'hali-saha', label: 'Halı Saha' },
  { id: 'spor', label: 'Spor & Antrenör' },
  { id: 'veteriner', label: 'Veteriner & Pet Kuaför' },
  { id: 'klinik', label: 'Klinik & Diyetisyen' },
  { id: 'egitim', label: 'Özel Ders & Kurs' },
  { id: 'fotograf', label: 'Fotoğraf Stüdyosu' },
  { id: 'terzi', label: 'Terzi' },
  { id: 'diger', label: 'Diğer' },
] as const;

export function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? 'Diğer';
}

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const STATUS: Record<AppointmentStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Onay bekliyor', bg: '#fef3c7', fg: '#92400e' },
  confirmed: { label: 'Onaylandı', bg: '#d1fae5', fg: '#065f46' },
  completed: { label: 'Tamamlandı', bg: '#e0f2fe', fg: '#075985' },
  cancelled: { label: 'İptal', bg: '#e7e5e4', fg: '#57534e' },
  no_show: { label: 'Gelmedi', bg: '#ffe4e6', fg: '#be123c' },
};
