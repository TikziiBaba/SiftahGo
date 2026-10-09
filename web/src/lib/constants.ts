import type { AppointmentStatus } from "./types";

export const SITE_NAME = "SiftahGo";
export const SITE_DOMAIN = "siftahgo.com";

export const CATEGORIES = [
  { id: "berber", label: "Berber" },
  { id: "kuafor", label: "Kuaför" },
  { id: "guzellik", label: "Güzellik Salonu" },
  { id: "tirnak", label: "Tırnak & Kirpik" },
  { id: "spa", label: "Spa & Masaj" },
  { id: "dovme", label: "Dövme & Piercing" },
  { id: "oto-yikama", label: "Oto Yıkama" },
  { id: "oto-servis", label: "Oto Servis" },
  { id: "hali-saha", label: "Halı Saha" },
  { id: "spor", label: "Spor & Antrenör" },
  { id: "veteriner", label: "Veteriner & Pet Kuaför" },
  { id: "klinik", label: "Klinik & Diyetisyen" },
  { id: "egitim", label: "Özel Ders & Kurs" },
  { id: "fotograf", label: "Fotoğraf Stüdyosu" },
  { id: "terzi", label: "Terzi" },
  { id: "diger", label: "Diğer" },
] as const;

export function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Diğer";
}

export const CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya",
  "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik",
  "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli",
  "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep",
  "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir",
  "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis", "Kırıkkale",
  "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin",
  "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya",
  "Samsun", "Şanlıurfa", "Siirt", "Sinop", "Şırnak", "Sivas", "Tekirdağ", "Tokat", "Trabzon",
  "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak",
];

export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  pending: { label: "Onay bekliyor", className: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20" },
  confirmed: { label: "Onaylandı", className: "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20" },
  completed: { label: "Tamamlandı", className: "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20" },
  cancelled: { label: "İptal", className: "bg-white/5 text-ink-3 ring-1 ring-line" },
  no_show: { label: "Gelmedi", className: "bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/20" },
};

// Veritabanındaki kısıtla aynı olmalı (supabase/schema.sql).
export const RESERVED_SLUGS = [
  "panel", "kesfet", "giris", "kayit", "hesabim", "api", "auth", "admin", "sifremi-unuttum", "sifre-yenile",
];

// Paket kartlarında gösterilen özellik metinleri (fiyat ve limitler veritabanındaki plans tablosundan gelir).
export const PLAN_FEATURES: Record<string, string> = {
  customers: "Müşteri defteri",
  reports: "Ciro raporları",
};
export const BASE_FEATURES = [
  "7/24 online randevu sayfası",
  "Çakışmasız takvim, izin ve tatil günleri",
  "WhatsApp ile hatırlatma",
  "QR kod ve kendi adresiniz",
  "Müşteri yorumları",
];

export function isSubscribed(b: { subscription_ends_at: string | null }) {
  return !!b.subscription_ends_at && new Date(b.subscription_ends_at) > new Date();
}

// Mobil uygulama indirme bağlantıları (.env). Boş olan "Yakında" gösterilir.
export const APP_LINKS = {
  apk: process.env.NEXT_PUBLIC_ANDROID_APK_URL || null,
  playStore: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null,
  appStore: process.env.NEXT_PUBLIC_APP_STORE_URL || null,
};
