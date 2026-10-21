import type Ionicons from '@expo/vector-icons/Ionicons';

import { colors } from './theme';
import type { AppointmentStatus } from './types';

export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://siftahgo.com';
/** Sayfa adreslerinde gösterilen alan adı (örn. siftahgo.com/usta-berber) */
export const SITE_DOMAIN = WEB_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Web ile aynı liste (web/src/lib/constants.ts). İkonlar sadece mobilde.
export const CATEGORIES = [
  { id: 'berber', label: 'Berber', icon: 'cut-outline' },
  { id: 'kuafor', label: 'Kuaför', icon: 'brush-outline' },
  { id: 'guzellik', label: 'Güzellik Salonu', icon: 'sparkles-outline' },
  { id: 'tirnak', label: 'Tırnak & Kirpik', icon: 'hand-left-outline' },
  { id: 'spa', label: 'Spa & Masaj', icon: 'leaf-outline' },
  { id: 'dovme', label: 'Dövme & Piercing', icon: 'color-palette-outline' },
  { id: 'oto-yikama', label: 'Oto Yıkama', icon: 'water-outline' },
  { id: 'oto-servis', label: 'Oto Servis', icon: 'construct-outline' },
  { id: 'hali-saha', label: 'Halı Saha', icon: 'football-outline' },
  { id: 'spor', label: 'Spor & Antrenör', icon: 'barbell-outline' },
  { id: 'veteriner', label: 'Veteriner & Pet Kuaför', icon: 'paw-outline' },
  { id: 'klinik', label: 'Klinik & Diyetisyen', icon: 'medkit-outline' },
  { id: 'egitim', label: 'Özel Ders & Kurs', icon: 'school-outline' },
  { id: 'fotograf', label: 'Fotoğraf Stüdyosu', icon: 'camera-outline' },
  { id: 'terzi', label: 'Terzi', icon: 'shirt-outline' },
  { id: 'diger', label: 'Diğer', icon: 'grid-outline' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

export function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? 'Diğer';
}

export function categoryIcon(id: string): IconName {
  return CATEGORIES.find((c) => c.id === id)?.icon ?? 'grid-outline';
}

// Web ile aynı liste (web/src/lib/constants.ts).
export const CITIES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya',
  'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik',
  'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
  'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep',
  'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir',
  'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale',
  'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin',
  'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya',
  'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon',
  'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
];

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const STATUS: Record<AppointmentStatus, { label: string; fg: string; bg: string; icon: IconName }> = {
  pending: { label: 'Onay bekliyor', fg: colors.warning, bg: colors.warningTint, icon: 'hourglass-outline' },
  confirmed: { label: 'Onaylandı', fg: colors.success, bg: colors.successTint, icon: 'checkmark-circle' },
  completed: { label: 'Tamamlandı', fg: colors.info, bg: colors.infoTint, icon: 'checkmark-done' },
  cancelled: { label: 'İptal', fg: colors.ink3, bg: colors.white04, icon: 'close-circle' },
  no_show: { label: 'Gelmedi', fg: colors.danger, bg: colors.dangerTint, icon: 'ban-outline' },
};

// İşletmenin reddederken veya iptal ederken seçebileceği hazır açıklamalar (müşteriye gider). Web'dekiyle aynı.
export const CANCEL_REASONS = [
  'Bu saat dolu',
  'Personelimiz o saatte müsait değil',
  'Bu hizmeti şu an veremiyoruz',
  'Lütfen randevu için bizi arayın',
];

// Randevu onay modları (businesses.auto_confirm + auto_confirm_known_only). Sık iptal eden müşteri her modda onaya düşer.
export const CONFIRM_MODES = [
  { id: 'auto', label: 'Hepsini otomatik onayla', hint: 'Müşteri randevu alır almaz onaylanır.', auto_confirm: true, auto_confirm_known_only: false },
  {
    id: 'known',
    label: 'Tanıdık müşteriyi otomatik onayla',
    hint: 'Daha önce sizde randevusu tamamlanmış müşteriler otomatik onaylanır; ilk kez gelenler onayınıza düşer.',
    auto_confirm: true,
    auto_confirm_known_only: true,
  },
  { id: 'manual', label: 'Hepsini ben onaylayayım', hint: 'Her randevu panelden onaylamanızı bekler.', auto_confirm: false, auto_confirm_known_only: false },
] as const;

export function confirmMode(b: { auto_confirm: boolean; auto_confirm_known_only: boolean }) {
  return CONFIRM_MODES.find((m) => m.id === (!b.auto_confirm ? 'manual' : b.auto_confirm_known_only ? 'known' : 'auto'))!;
}

// Veritabanındaki kısıtla aynı olmalı (supabase/schema.sql).
export const RESERVED_SLUGS = [
  'panel', 'kesfet', 'giris', 'kayit', 'hesabim', 'api', 'auth', 'admin', 'sifremi-unuttum', 'sifre-yenile',
  'yasal', 'iletisim', 'esnaf',
];

// Paket kartlarında gösterilen özellik metinleri (web ile aynı).
export const PLAN_FEATURES: Record<string, string> = {
  customers: 'Müşteri defteri, notlar ve seans paketleri',
  reports: 'Ciro, doluluk ve geri dönen müşteri raporları',
  announcement: 'Sayfada duyuru bandı',
  links: 'WhatsApp, Instagram ve web kısayolları',
  theme: 'Sayfa rengi seçimi',
};
export const BASE_FEATURES = [
  '7/24 online randevu sayfası',
  'Çakışmasız takvim, izin ve tatil günleri',
  'WhatsApp ile hatırlatma',
  'QR kod ve kendi adresiniz',
  'Müşteri yorumları',
];

export function isSubscribed(b: { subscription_ends_at: string | null }) {
  return !!b.subscription_ends_at && new Date(b.subscription_ends_at) > new Date();
}

/** Ücretsiz denemede mi. Ödeme veya yönetici süre ekleyince deneme biter. */
export function isTrial(b: { subscription_ends_at: string | null; trial_ends_at: string | null }) {
  return isSubscribed(b) && b.subscription_ends_at === b.trial_ends_at;
}
