// Yönetici fonksiyonlarının (supabase/schema.sql: admin_*) dönüş tipleri.

export type AdminStats = {
  users: number;
  users_30d: number;
  businesses: number;
  businesses_30d: number;
  active: number;
  live: number;
  suspended: number;
  expiring_7d: number;
  expired: number;
  never_paid: number;
  mrr: number;
  revenue_total: number;
  revenue_30d: number;
  payments_failed_30d: number;
  appointments: number;
  appointments_30d: number;
  upcoming: number;
  gmv_30d: number;
  reviews: number;
  by_status: Record<string, number>;
  by_plan: { id: string; name: string; price: number; count: number }[];
  by_category: Record<string, number>;
  by_city: Record<string, number>;
  notifications: { pending: number; failed: number; sent_24h: number };
  daily: { day: string; users: number; businesses: number; appointments: number; revenue: number }[];
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "customer" | "business";
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  is_admin: boolean;
  business_id: string | null;
  business_name: string | null;
  business_slug: string | null;
  appointment_count: number;
};
