// Yönetici fonksiyonlarının (supabase/schema.sql: admin_*) dönüş tipleri.

export type AdminStats = {
  users: number;
  users_30d: number;
  businesses: number;
  businesses_30d: number;
  active: number;
  trial: number;
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

/** Bu dönem / önceki eşit uzunluktaki dönem. */
export type Pair = { cur: number; prev: number };

// admin_dashboard(p_from, p_to): Genel Bakış ve Analitik.
export type AdminDashboard = {
  from: string;
  to: string;
  days: number;
  snapshot: Omit<AdminStats, "daily">;
  kpi: Record<
    | "users" | "customers" | "businesses" | "referred" | "bookings" | "online_bookings" | "appointments" | "completed"
    | "cancelled" | "no_show" | "total" | "gmv" | "active_customers" | "active_businesses" | "revenue" | "revenue_paytr"
    | "payments" | "failed_payments" | "payment_attempts" | "new_paying" | "churned" | "trial_ended" | "trial_converted"
    | "reviews" | "rating" | "returning_customers",
    Pair
  >;
  daily: {
    day: string;
    users: number;
    businesses: number;
    bookings: number;
    appointments: number;
    completed: number;
    cancelled: number;
    gmv: number;
    revenue: number;
    payments: number;
    mrr: number;
  }[];
  funnel_business: { signups: number; business: number; setup: number; published: number; first_booking: number; paid: number };
  funnel_customer: { signups: number; favorited: number; booked: number; completed: number; returned: number; reviewed: number };
  status: Record<string, number>;
  heatmap: { d: number; h: number; c: number }[];
  lead_time: { h2: number; same_day: number; d3: number; d7: number; more: number };
  by_category: { key: string; businesses: number; appointments: number; gmv: number }[];
  by_city: { key: string; businesses: number; appointments: number; gmv: number }[];
  revenue_by_plan: { plan_id: string; name: string; months: number; source: "paytr" | "admin"; count: number; amount: number }[];
  top_businesses: {
    id: string;
    name: string;
    slug: string;
    category: string;
    city: string;
    rating_avg: number;
    rating_count: number;
    appointments: number;
    gmv: number;
    no_shows: number;
    customers: number;
  }[];
  at_risk: { id: string; name: string; slug: string; city: string; created_at: string; subscription_ends_at: string; trial: boolean; last_booking: string | null }[];
  ratings: { dist: Record<"1" | "2" | "3" | "4" | "5", number>; count: number; avg: number; unanswered: number; low: number };
  engagement: {
    favorites_total: number;
    favorites: number;
    waitlist: number;
    waitlist_notified: number;
    rescheduled: number;
    referral_rewarded: number;
    session_packages: number;
    blocked: number;
  };
  ops: {
    email: Record<string, number>;
    email_by_kind: { kind: string; status: string; count: number }[];
    email_oldest_pending: string | null;
    push: Record<string, number>;
    push_tokens: Record<string, number>;
    errors_open: number;
    errors_by_source: Record<string, number>;
  };
  cohorts: { month: string; size: number; active: number[] }[];
  customer_cohorts: { month: string; size: number; active: number[] }[];
};

export type AdminActivity = {
  kind: "user" | "business" | "appointment" | "payment" | "review";
  occurred_at: string;
  title: string;
  detail: string;
  ref_id: string | null;
  slug: string | null;
};

export type AdminHealth = {
  paytr: boolean;
  paytrTestMode: boolean;
  email: boolean;
  r2: boolean;
  serviceRole: boolean;
  cron: boolean;
  turnstile: boolean;
  appUrl: string | null;
  region: string | null;
  commit: string | null;
};
