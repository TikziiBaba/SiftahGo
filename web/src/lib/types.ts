export type Role = "customer" | "business";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
};

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
  slot_minutes: number;
  booking_days: number;
  min_notice_minutes: number;
  auto_confirm: boolean;
  is_published: boolean;
  timezone: string;
  rating_avg: number;
  rating_count: number;
  plan_id: string | null;
  subscription_ends_at: string | null;
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
  status: "pending" | "paid" | "failed";
  created_at: string;
  paid_at: string | null;
};

export type StaffService = { staff_id: string; service_id: string };

export type Review = {
  id: string;
  business_id: string;
  appointment_id: string;
  customer_id: string | null;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type WorkingHour = {
  business_id: string;
  weekday: number; // 1 = Pazartesi ... 7 = Pazar
  is_open: boolean;
  open_time: string; // "09:00:00"
  close_time: string;
};

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
  note: string;
  price: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  created_at: string;
};
