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
  pending: { label: "Onay bekliyor", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Onaylandı", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Tamamlandı", className: "bg-sky-100 text-sky-800" },
  cancelled: { label: "İptal", className: "bg-stone-200 text-stone-600" },
  no_show: { label: "Gelmedi", className: "bg-rose-100 text-rose-700" },
};

// Veritabanındaki kısıtla aynı olmalı (supabase/schema.sql).
export const RESERVED_SLUGS = [
  "panel", "kesfet", "giris", "kayit", "hesabim", "api", "auth", "admin", "sifremi-unuttum", "sifre-yenile",
];
