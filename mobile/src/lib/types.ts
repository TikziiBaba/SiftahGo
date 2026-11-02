export type Role = "customer" | "business";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
};

// Başvuru onayı: yönetici onaylayana kadar işletme görünmez; reddedilirse approval_note sebebi yazar.
export type ApprovalStatus = "pending" | "approved" | "rejected";

// Randevulu işletme (varsayılan) ya da randevu almayan vitrin: menü ve kuponla sayfa açar.
export type BusinessType = "appointment" | "showcase";

export type Business = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  logo_url: string | null;
  cover_url: string | null;
  gallery: string[];
  // Sayfa özelleştirme (paketteki özelliğe göre görünür)
  accent: string;
  announcement: string;
  whatsapp: string;
  instagram: string;
  website: string;
  slot_minutes: number;
  booking_days: number;
  min_notice_minutes: number;
  auto_confirm: boolean;
  // auto_confirm açıkken yalnızca daha önce randevusu tamamlanmış müşteri otomatik onaylanır
  auto_confirm_known_only: boolean;
  is_published: boolean;
  is_suspended: boolean;
  approval_status: ApprovalStatus;
  approval_note: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  timezone: string;
  rating_avg: number;
  rating_count: number;
  plan_id: string | null;
  subscription_ends_at: string | null;
  // Ücretsiz deneme bitişi; subscription_ends_at buna eşitse işletme denemededir.
  trial_ends_at: string | null;
  // Keşfet "Yakınımda" için konum (ikisi birlikte dolu ya da boş)
  latitude: number | null;
  longitude: number | null;
  // Davet kodu; davetle geldiyse davet eden işletme ve ödülün verildiği tarih
  referral_code: string;
  referred_by: string | null;
  referral_rewarded_at: string | null;
  business_type: BusinessType;
};

export type SuspensionReason = "kural_ihlali" | "odeme" | "sikayet" | "sahip_talebi" | "diger";

// Askı kaydı. lifted_at boşsa sürüyor; lifted_at dolu, lifted_by boşsa süre dolunca kendiliğinden kalktı.
export type BusinessSuspension = {
  id: string;
  business_id: string;
  reason: SuspensionReason;
  note: string;
  until: string | null;
  appointments_cancelled: number;
  pause_subscription: boolean;
  created_by: string | null;
  created_at: string;
  lifted_at: string | null;
  lifted_by: string | null;
};

export type FreezeRequest = {
  id: string;
  business_id: string;
  reason: string;
  starts_on: string;
  ends_on: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};

export type SupportCategory = "randevu" | "odeme" | "hesap" | "teknik" | "sikayet" | "diger";
export type SupportStatus = "waiting" | "answered" | "closed";

export type SupportTicket = {
  id: string;
  user_id: string;
  business_id: string | null;
  audience: "customer" | "business";
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  created_at: string;
  last_message_at: string;
  closed_at: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  from_admin: boolean;
  body: string;
  created_at: string;
};

// Vitrin menüsü ürünü. category boşsa kategorisiz; sayfada kategoriye göre gruplanır.
export type MenuItem = {
  id: string;
  business_id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  sort_order: number;
};

export type Staff = {
  id: string;
  business_id: string;
  name: string;
  title: string;
  avatar_url: string | null;
  is_active: boolean;
  sort_order: number;
};

export type Plan = {
  id: string;
  name: string;
  price: number;
  staff_limit: number | null;
  features: string[];
  sort_order: number;
};

export type Payment = {
  id: string;
  plan_id: string;
  merchant_oid: string;
  amount: number;
  // 1: aylık (30 gün), 12: yıllık (365 gün)
  months: number;
  status: "pending" | "paid" | "failed";
  created_at: string;
  paid_at: string | null;
};

export type StaffService = { staff_id: string; service_id: string };

export type Review = {
  id: string;
  business_id: string;
  // Vitrin kupon yorumunda randevu yoktur
  appointment_id: string | null;
  // Dolu ise kasada kullanılan kupon için yazılmış yorum
  coupon_claim_id?: string | null;
  customer_id: string | null;
  customer_name: string;
  rating: number;
  comment: string;
  // İşletmenin herkese açık cevabı (boş = cevap yok)
  reply: string;
  replied_at: string | null;
  created_at: string;
};

export type WorkingHour = {
  business_id: string;
  weekday: number; // 1 = Pazartesi ... 7 = Pazar
  is_open: boolean;
  open_time: string; // "09:00:00"
  close_time: string;
};

// Personelin kendi saatleri; bir gün için kaydı yoksa işletme saatleri geçerlidir.
export type StaffHour = {
  staff_id: string;
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

// Müşteriye satılan seans paketi (telefonun son 10 hanesine bağlı); kalan seans = total - used.
export type SessionPackage = {
  id: string;
  business_id: string;
  phone_key: string;
  customer_name: string;
  service_id: string | null;
  name: string;
  total: number;
  used: number;
  created_at: string;
};

// İşletmenin müşteri hakkındaki özel notu (telefonun son 10 hanesine bağlı).
export type CustomerNote = { business_id: string; phone_key: string; note: string; updated_at: string };

export type ReportSummary = { capacity_minutes: number; booked_minutes: number; customers: number; returning: number };

export type TimeOff = {
  id: string;
  business_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
};

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export type Appointment = {
  id: string;
  business_id: string;
  service_id: string | null;
  staff_id: string | null;
  customer_id: string | null;
  service_name: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  note: string;
  price: number;
  // Kuponlu randevuda price indirimli fiyat, list_price indirimsiz hizmet fiyatı
  list_price: number | null;
  coupon_claim_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  cancelled_by: "customer" | "business" | null;
  // İşletmenin iptal/ret açıklaması (müşteriye gider); rejected: onay bekleyen randevu reddedildi
  cancel_reason: string;
  rejected: boolean;
  // Randevu alınırken müşterinin son 6 aydaki geçmişi (tüm işletmelerde)
  prior_cancels: number;
  prior_no_shows: number;
  // Sık iptal eden / gelmeyen müşteri
  customer_flagged: boolean;
  // Seansı düşülen paket (tamamlanınca)
  package_id: string | null;
  // Gecikme haberi: son haberin dakikası/zamanı ve verilen haber sayısı (randevu saati değişmez)
  customer_late_minutes: number | null;
  customer_late_at: string | null;
  customer_late_count: number;
  business_delay_minutes: number | null;
  business_delay_at: string | null;
  business_delay_count: number;
  created_at: string;
};

// customer_card: işletmenin gelen randevunun müşterisi hakkında gördükleri. Hesapsız (elle eklenen)
// randevuda platform ve reviews boştur.
export type CustomerCard = {
  member_since: string | null;
  here: { completed: number; cancelled: number; no_show: number; last_visit: string | null };
  platform: { completed: number; cancelled: number; no_show: number; businesses: number } | null;
  reviews: {
    count: number;
    avg: number | null;
    latest: { business: string; rating: number; comment: string; created_at: string }[];
  } | null;
};

// İşletmenin online randevusunu engellediği müşteri
export type BlockedCustomer = {
  id: string;
  business_id: string;
  customer_id: string | null;
  phone_key: string | null;
  customer_name: string;
  created_at: string;
};

// Esnaf kuponu (business_coupons satırı). weekdays: 1 = Pazartesi ... 7 = Pazar, boş = her gün; service_ids boş = tüm hizmetler.
// claimed: alınan, used: kullanılan kupon sayısı. İlk alımdan sonra tür, değer, gün-saat ve hizmetler kilitlenir.
export type Coupon = {
  id: string;
  title: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  starts_on: string;
  ends_on: string;
  weekdays: number[];
  start_time: string | null;
  end_time: string | null;
  total_limit: number | null;
  service_ids: string[];
  is_active: boolean;
  created_at: string;
  claimed: number;
  used: number;
};

// Müşterinin aldığı kupon ve hesabına özel 6 haneli kodu.
export type CouponClaim = {
  id: string;
  coupon_id: string;
  business_id: string;
  customer_id: string | null;
  code: string;
  redeemed_at: string | null;
  appointment_id: string | null;
  created_at: string;
};

// İşletme sayfasında herkese açık kupon (coupons tablosunun okunan alanları); claimed_count alınan sayıdır.
export type PublicCoupon = Pick<
  Coupon,
  "id" | "title" | "discount_type" | "discount_value" | "starts_on" | "ends_on" | "weekdays" | "start_time" | "end_time" | "service_ids" | "total_limit"
> & { claimed_count: number };

// Müşterinin kuponu (my_coupons satırı). state: used kullanıldı, attached aktif bir randevuya bağlı, expired süresi doldu, active.
export type MyCoupon = {
  claim_id: string;
  code: string;
  claimed_at: string;
  redeemed_at: string | null;
  appointment_id: string | null;
  coupon_id: string;
  title: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  starts_on: string;
  ends_on: string;
  weekdays: number[];
  start_time: string | null;
  end_time: string | null;
  service_ids: string[];
  business_id: string;
  business_name: string;
  business_slug: string;
  state: "active" | "attached" | "used" | "expired" | "unavailable";
};
