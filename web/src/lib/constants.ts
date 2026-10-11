import type { CSSProperties } from "react";
import type { AppointmentStatus } from "./types";

export const SITE_NAME = "SiftahGo";
/** Sayfa adreslerinde gösterilen alan adı (örn. siftahgo.com/usta-berber); sitenin gerçek adresinden gelir. */
export const SITE_DOMAIN = (process.env.NEXT_PUBLIC_APP_URL || "https://siftahgo.com").replace(/^https?:\/\//, "").replace(/\/$/, "");

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
  "yasal", "iletisim",
];

// Paket kartlarında gösterilen özellik metinleri (fiyat ve limitler veritabanındaki plans tablosundan gelir).
export const PLAN_FEATURES: Record<string, string> = {
  customers: "Müşteri defteri",
  reports: "Ciro raporları",
  announcement: "Sayfada duyuru bandı",
  links: "WhatsApp, Instagram ve web kısayolları",
  theme: "Sayfa rengi seçimi",
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

/** Ücretsiz denemede mi. Ödeme veya yönetici süre ekleyince deneme biter. */
export function isTrial(b: { subscription_ends_at: string | null; trial_ends_at: string | null }) {
  return isSubscribed(b) && b.subscription_ends_at === b.trial_ends_at;
}

// Mobil uygulama indirme bağlantıları (.env). Boş olan "Yakında" gösterilir.
export const APP_LINKS = {
  apk: process.env.NEXT_PUBLIC_ANDROID_APK_URL || null,
  playStore: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null,
  appStore: process.env.NEXT_PUBLIC_APP_STORE_URL || null,
};

// Dükkân sayfası renkleri (Pro paketi). Tailwind renk ölçekleri; turkuaz marka rengi.
// Kimlikler veritabanındaki businesses.accent kısıtıyla, değerler mobile/src/lib/constants.ts ile aynı tutulmalı.
export const ACCENTS = [
  { id: "turkuaz", label: "Turkuaz", scale: ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a", "#042f2e"] },
  { id: "zumrut", label: "Zümrüt", scale: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"] },
  { id: "gok", label: "Gök", scale: ["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#075985", "#0c4a6e", "#082f49"] },
  { id: "lavanta", label: "Lavanta", scale: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"] },
  { id: "pembe", label: "Pembe", scale: ["#fdf2f8", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843", "#500724"] },
  { id: "kehribar", label: "Kehribar", scale: ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#92400e", "#78350f", "#451a03"] },
  { id: "mercan", label: "Mercan", scale: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337", "#4c0519"] },
] as const;

export function accentOf(id: string | undefined) {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

/** Sayfa rengini, içindeki tüm marka renkli öğelere (brand-50…950) uygulayan CSS değişkenleri. */
export function accentVars(id: string | undefined) {
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return Object.fromEntries(accentOf(id).scale.map((c, i) => [`--color-brand-${steps[i]}`, c])) as CSSProperties;
}
