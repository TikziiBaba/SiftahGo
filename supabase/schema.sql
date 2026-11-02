-- =====================================================================
-- SiftahGo — veritabanı şeması
-- Supabase > SQL Editor'de tamamını tek seferde çalıştırın.
-- DİKKAT: Eski şemadaki tüm tabloları ve verileri siler. Tekrar
-- çalıştırılabilir (her çalıştırmada sıfırdan kurar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Eski şemayı temizle
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.menu_items,
  public.coupon_code_attempts,
  public.coupon_claims,
  public.coupons,
  public.delay_notices,
  public.support_emails,
  public.support_messages,
  public.support_tickets,
  public.error_logs,
  public.waitlist,
  public.session_packages,
  public.favorites,
  public.customer_notes,
  public.staff_hours,
  public.freeze_requests,
  public.business_suspensions,
  public.appointment_reminders,
  public.blocked_customers,
  public.phone_verifications,
  public.app_settings,
  public.inbox,
  public.push_tokens,
  public.notifications,
  public.payments,
  public.reviews,
  public.staff_services,
  public.payment_history,
  public.subscriptions,
  public.appointments,
  public.time_off,
  public.working_hours,
  public.staff,
  public.services,
  public.businesses,
  public.profiles,
  public.plans,
  public.admins
cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'handle_new_user', 'update_updated_at_column', 'check_appointment_overlap',
        'get_available_slots', 'book_appointment', 'cancel_appointment', 'reschedule_appointment',
        'is_business_owner', 'business_after_insert', 'add_review',
        'refresh_business_rating', 'get_customers', 'protect_business_rating',
        'protect_business_columns', 'is_bookable', 'enforce_staff_limit', 'create_payment',
        'activate_subscription', 'fail_payment', 'plan_has_feature',
        'queue_appointment_notifications', 'queue_due_reminders', 'claim_notifications',
        'finish_notification', 'is_admin', 'apply_subscription', 'admin_stats', 'admin_users',
        'admin_grant_subscription', 'admin_end_subscription', 'admin_set_suspended',
        'format_when', 'inbox_insert', 'register_push_token', 'unregister_push_token',
        'mark_inbox_read', 'claim_push', 'finish_push', 'drop_push_tokens',
        'customer_history', 'appointments_before_write', 'queue_review_requests', 'review_after_insert',
        'reply_review', 'start_phone_verification', 'confirm_phone_verification', 'block_customer',
        'auto_block_no_show', 'get_report_summary', 'join_waitlist', 'waitlist_on_free_slot', 'claim_waitlist',
        'use_package_session', 'available_today', 'nearby_businesses', 'apply_referral', 'my_referrals',
        'log_error', 'protect_appointment_columns', 'admin_dashboard', 'admin_activity', 'delete_my_account',
        'admin_review_business', 'admin_set_business_type', 'needs_confirmation', 'customer_card', 'is_upload_url', 'is_upload_urls',
        'protect_profile_columns', 'admin_suspend_business', 'admin_lift_suspension', 'lift_suspension',
        'lift_due_suspensions', 'request_freeze', 'admin_reject_freeze_request',
        'support_add_message', 'support_check_rate', 'open_support_ticket', 'reply_support_ticket',
        'admin_reply_support_ticket', 'admin_close_support_ticket', 'claim_support_emails', 'finish_support_email',
        'report_customer_late', 'report_business_delay', 'claim_delay_notices',
        'coupon_price', 'coupon_invalid_reason', 'coupon_valid_at', 'coupon_claim_used', 'coupon_claim_state',
        'coupon_redeem_problem', 'coupon_lookup', 'save_coupon', 'set_coupon_active', 'delete_coupon',
        'claim_coupon', 'find_coupon_code', 'redeem_coupon_code', 'undo_coupon_redeem', 'my_coupons', 'business_coupons',
        'enforce_menu_limit', 'enforce_working_hours', 'add_coupon_review', 'claim_coupon_review_requests', 'claim_coupon_review_notices'
      )
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

drop type if exists
  public.user_role, public.business_category, public.subscription_tier,
  public.subscription_status, public.appointment_status, public.payment_status,
  public.approval_status
cascade;

create extension if not exists btree_gist with schema extensions;

-- İşletme görselleri yalnızca sitenin yükleme adresinin (/api/upload) R2'ye yazdığı dosyalar olabilir. Başka bir adres
-- (ör. ziyaretçinin IP'sini toplayan izleme pikseli) web'de CSP ile engellenir ama mobil uygulamada açılırdı.
-- R2'nin herkese açık adresi değişirse yalnızca bu fonksiyon güncellenir.
create function public.is_upload_url(p_url text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(
    p_url ~ '^https://cdn\.siftahgo\.app/businesses/[0-9a-f-]{36}/(logo|cover|gallery|menu)/[A-Za-z0-9._-]+$',
    false
  );
$$;

create function public.is_upload_urls(p_urls text[])
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(public.is_upload_url(u)), true) from unnest(p_urls) u;
$$;

-- ---------------------------------------------------------------------
-- 1) Tablolar
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (length(full_name) <= 100),
  phone       text check (length(phone) <= 30),
  -- Sadece arayüz yönlendirmesi için; yetki vermez.
  role        text not null default 'customer' check (role in ('customer', 'business')),
  created_at  timestamptz not null default now()
);

-- Site yöneticileri (e-posta ile). Hesabın e-postası doğrulanmış olmalı.
create table public.admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

insert into public.admins (email) values ('dedyusuf99@gmail.com');

-- Ücretli paketler. Fiyatları buradan değiştirin (aylık, TL).
create table public.plans (
  id          text primary key,
  name        text not null,
  price       numeric(10, 2) not null check (price > 0),
  staff_limit int check (staff_limit > 0), -- boş = sınırsız
  -- 'customers', 'reports', 'announcement' (duyuru bandı), 'links' (WhatsApp/Instagram/web kısayolları),
  -- 'theme' (sayfa rengi), 'coupons' (kupon), 'menu' (menü; yalnızca Vitrin)
  features    text[] not null default '{}',
  sort_order  int not null default 0
);

-- 'vitrin': randevu almayan işletmelerin (business_type = 'showcase') tek paketi; randevulu işletmeler alamaz.
insert into public.plans (id, name, price, staff_limit, features, sort_order) values
  ('vitrin', 'Vitrin', 149, 1, '{coupons,announcement,links,menu}', 0),
  ('baslangic', 'Başlangıç', 349, 1, '{}', 1),
  ('esnaf', 'Esnaf', 649, 5, '{customers,reports,announcement,links,coupons}', 2),
  ('pro', 'Pro', 999, null, '{customers,reports,announcement,links,theme,coupons}', 3);

create table public.businesses (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null unique references public.profiles (id) on delete cascade,
  slug               text not null unique
                     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 50)
                     -- Web sitesindeki sayfa adlarıyla çakışmasın.
                     check (slug not in (
                       'panel', 'kesfet', 'giris', 'kayit', 'hesabim', 'api', 'auth', 'admin',
                       'sifremi-unuttum', 'sifre-yenile', 'yasal', 'iletisim', 'esnaf'
                     )),
  name               text not null check (length(trim(name)) > 0 and length(name) <= 100),
  category           text not null default 'diger' check (length(category) <= 40),
  -- 'appointment': randevulu işletme. 'showcase': vitrin (lokanta, market gibi); randevu almaz, personeli olmaz.
  -- Eklemede seçilir; sonradan yalnızca admin_set_business_type değiştirir (protect_business_columns).
  business_type      text not null default 'appointment' check (business_type in ('appointment', 'showcase')),
  description        text not null default '' check (length(description) <= 2000),
  phone              text not null default '' check (length(phone) <= 30),
  city               text not null default '' check (length(city) <= 60),
  district           text not null default '' check (length(district) <= 60),
  address            text not null default '' check (length(address) <= 300),
  -- Görseller yalnızca https adresi olabilir (javascript:/data: gibi adresler sayfaya girmesin).
  logo_url           text check (logo_url ~ '^https://\S+$' and length(logo_url) <= 500),
  cover_url          text check (cover_url ~ '^https://\S+$' and length(cover_url) <= 500),
  gallery            text[] not null default '{}'
                     check (cardinality(gallery) <= 12
                            and (cardinality(gallery) = 0 or array_to_string(gallery, E'\n') ~ '^https://\S+(\nhttps://\S+)*$')),
  -- Sayfa özelleştirme. Paketinde ilgili özellik varsa sayfada görünür; paket düşerse silinmez, gizlenir.
  accent             text not null default 'turkuaz'
                     check (accent in ('turkuaz', 'zumrut', 'gok', 'lavanta', 'pembe', 'kehribar', 'mercan')),
  announcement       text not null default '' check (length(announcement) <= 160),
  whatsapp           text not null default '' check (whatsapp ~ '^[0-9+ ()-]{0,20}$'),
  instagram          text not null default '' check (instagram ~ '^[A-Za-z0-9._]{0,30}$'),
  website            text not null default ''
                     check (website = '' or (website ~ '^https?://\S+$' and length(website) <= 200)),
  slot_minutes       int not null default 30 check (slot_minutes between 5 and 240),
  booking_days       int not null default 30 check (booking_days between 1 and 365),
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 10080),
  auto_confirm       boolean not null default true,
  -- auto_confirm açıkken yalnızca bu işletmede daha önce randevusu tamamlanmış müşteri otomatik onaylanır;
  -- ilk kez gelenin randevusu onaya düşer (needs_confirmation). Paneldeki üç mod: otomatik / tanıdığı otomatik / elle.
  auto_confirm_known_only boolean not null default false,
  is_published       boolean not null default true,
  -- Yönetici yayından kaldırdıysa sahibi yeniden açamaz (admin_set_suspended).
  is_suspended       boolean not null default false,
  -- Başvuru onayı: yeni işletme 'pending' açılır, yönetici admin_review_business ile onaylar ya da sebebiyle reddeder.
  -- Onaylanmayan işletme görünmez, randevu ve ödeme almaz; ücretsiz deneme onayla başlar. Reddedilen işletmenin
  -- sahibi bilgilerini düzeltip approval_status'u 'pending' yaparak yeniden başvurur (protect_business_columns).
  approval_status    text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approval_note      text not null default '' check (length(approval_note) <= 500), -- ret sebebi
  submitted_at       timestamptz not null default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  timezone           text not null default 'Europe/Istanbul',
  -- Değerlendirmelerden tetikleyiciyle hesaplanır.
  rating_avg         numeric(2, 1) not null default 0,
  rating_count       int not null default 0,
  -- Keşfet sıralaması: az yorumlu işletme 4,0'a çekilir (3 sanal oy); tek 5 yıldız, çok yorumlu 4,8'i geçemez.
  rating_score       numeric generated always as ((rating_avg * rating_count + 12) / (rating_count + 3)) stored,
  -- Abonelik: sadece ödeme bildirimiyle (activate_subscription) değişir.
  plan_id              text references public.plans (id),
  subscription_ends_at timestamptz,
  -- Ücretsiz deneme bitişi (business_after_insert). subscription_ends_at buna eşitse işletme denemededir;
  -- ödeme veya yönetici süre ekleyince ayrışır.
  trial_ends_at        timestamptz,
  -- Keşfet "Yakınımda" için işletmenin konumu (sahibi ayarlardan girer); ikisi birlikte dolu ya da boş.
  latitude           double precision check (latitude between -90 and 90),
  longitude          double precision check (longitude between -180 and 180),
  -- Davet ("esnaf esnafı getirsin"): her işletmenin kodu; davetle gelen işletme apply_referral ile girer.
  -- Ödül activate_subscription'da: davetle gelenin ilk ödemesinde ikisine de 1 ay (referral_rewarded_at).
  referral_code        text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  referred_by          uuid references public.businesses (id) on delete set null,
  referral_rewarded_at timestamptz,
  created_at         timestamptz not null default now(),
  constraint businesses_location_check check ((latitude is null) = (longitude is null)),
  constraint businesses_images_upload_check check (
    (logo_url is null or public.is_upload_url(logo_url))
    and (cover_url is null or public.is_upload_url(cover_url))
    and public.is_upload_urls(gallery)
  )
);
create index businesses_city_category_idx on public.businesses (city, category);
create index businesses_pending_idx on public.businesses (submitted_at) where approval_status = 'pending';

create table public.services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (length(trim(name)) > 0 and length(name) <= 120),
  description      text not null default '' check (length(description) <= 1000),
  duration_minutes int not null check (duration_minutes between 5 and 600),
  price            numeric(10, 2) not null default 0 check (price >= 0),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);
create index services_business_idx on public.services (business_id);

create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0 and length(name) <= 80),
  title       text not null default '' check (length(title) <= 80),
  avatar_url  text check (avatar_url ~ '^https://\S+$' and length(avatar_url) <= 500),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint staff_avatar_upload_check check (avatar_url is null or public.is_upload_url(avatar_url))
);
create index staff_business_idx on public.staff (business_id);

-- Personelin verebildiği hizmetler. Personelin hiç kaydı yoksa tüm hizmetleri verir.
create table public.staff_services (
  staff_id   uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);

-- weekday: ISO (1 = Pazartesi ... 7 = Pazar)
create table public.working_hours (
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  is_open     boolean not null default true,
  open_time   time not null default '09:00',
  close_time  time not null default '19:00',
  primary key (business_id, weekday),
  -- Kapanış açılıştan önce olabilir (vitrinde gece yarısını aşan saat); randevulu işletmede enforce_working_hours engeller.
  constraint working_hours_check check (close_time <> open_time)
);

-- İzin / tatil / kapalı saatler. staff_id boşsa tüm işletme kapalıdır.
create table public.time_off (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid references public.staff (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null default '' check (length(reason) <= 200),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_business_idx on public.time_off (business_id, starts_at);

-- Müşteriye satılan seans paketi (ör. 10 seans lazer); müşteri defterinde kalan seans görünür. Paketteki hizmetten
-- tamamlanan her randevu bir seans düşer (use_package_session). Müşteri telefonunun son 10 hanesine bağlı.
create table public.session_packages (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  phone_key     text not null check (phone_key ~ '^[0-9]{10}$'),
  customer_name text not null default '' check (length(customer_name) <= 100),
  service_id    uuid references public.services (id) on delete set null,
  name          text not null check (length(trim(name)) > 0 and length(name) <= 120),
  total         int not null check (total between 1 and 500),
  used          int not null default 0 check (used >= 0),
  created_at    timestamptz not null default now(),
  check (used <= total)
);
create index session_packages_customer_idx on public.session_packages (business_id, phone_key);

create table public.appointments (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  service_id     uuid references public.services (id) on delete set null,
  staff_id       uuid references public.staff (id) on delete set null,
  customer_id    uuid references public.profiles (id) on delete set null,
  service_name   text not null check (length(service_name) <= 200),
  customer_name  text not null check (length(customer_name) <= 100),
  customer_phone text not null check (length(customer_phone) <= 30),
  -- Bildirim e-postaları için. Misafir isteğe bağlı yazar; girişli müşteride hesap e-postası.
  customer_email text check (customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(customer_email) <= 254),
  note           text not null default '' check (length(note) <= 1000),
  price          numeric(10, 2) not null default 0,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  -- İptal eden taraf; müşteri iptalleri güvenilirlik sayısına girer. appointments_before_write yazar.
  cancelled_by   text check (cancelled_by in ('customer', 'business')),
  -- İşletmenin iptal ederken ya da reddederken müşteriye yazdığı açıklama (bildirimde gider). rejected: onay
  -- bekleyen randevu reddedildi; müşteriye "onaylanmadı" denir. İkisini de appointments_before_write düzenler.
  cancel_reason  text not null default '' check (length(cancel_reason) <= 300),
  rejected       boolean not null default false,
  -- Randevu alınırken müşterinin son 6 aydaki geçmişi (tüm işletmelerde; hesap veya telefonla eşleşir).
  -- appointments_before_write yazar. customer_flagged: sık iptal eden / gelmeyen müşteri.
  prior_cancels    int not null default 0,
  prior_no_shows   int not null default 0,
  customer_flagged boolean not null default false,
  -- Seansı düşülen paket (use_package_session yazar).
  package_id       uuid references public.session_packages (id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Gecikme haberi (randevu saati değişmez). Müşteri "geç kalacağım" der (report_customer_late), işletme "gecikme
  -- var" der (report_business_delay). Son haberin dakikası ve zamanı ile bugüne dek verilen haber sayısı (en fazla 3).
  -- İstemci bu alanları elle değiştiremez (protect_appointment_columns).
  customer_late_minutes int check (customer_late_minutes in (5, 10, 15)),
  customer_late_at      timestamptz,
  customer_late_count   smallint not null default 0,
  business_delay_minutes int check (business_delay_minutes in (10, 15, 30, 45)),
  business_delay_at      timestamptz,
  business_delay_count   smallint not null default 0,
  check (ends_at > starts_at),
  -- Aynı personele aynı anda iki aktif randevu verilemez.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_business_time_idx on public.appointments (business_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id, starts_at);
-- Müşteri geçmişi telefonun son 10 hanesiyle eşleşir ("0555..." = "+90555...").
create index appointments_phone_idx on public.appointments ((right(regexp_replace(customer_phone, '\D', '', 'g'), 10)));

-- Gecikme haberi kuyruğu: report_* yazar, claim_delay_notices alır (/api/notifications gönderir).
-- recipient: haberi kim alır ('business': müşteri geç kalacak, 'customer': işletmede gecikme var).
create table public.delay_notices (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  recipient      text not null check (recipient in ('customer', 'business')),
  minutes        int not null check (minutes in (5, 10, 15, 30, 45)),
  status         text not null default 'pending' check (status in ('pending', 'sent')),
  created_at     timestamptz not null default now()
);
create index delay_notices_pending_idx on public.delay_notices (created_at) where status = 'pending';
create index delay_notices_appointment_idx on public.delay_notices (appointment_id);

-- Kupon tanımı (save_coupon yazar). weekdays working_hours ile aynı: 1 = Pazartesi, 7 = Pazar; boş = her gün.
-- Saatler işletmenin timezone değerine göre; start_time/end_time ikisi birlikte dolu ya da boş. service_ids boş = tüm hizmetler.
-- İlk alımdan sonra indirim, gün-saat ve hizmetler kilitlenir (save_coupon). claimed_count alınan kupon sayısıdır;
-- toplam sınır buna karşı sayılır, kullanılmayan kupon sınırdan yer açmaz.
create table public.coupons (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  title          text not null check (length(trim(title)) between 1 and 80),
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  starts_on      date not null,
  ends_on        date not null,
  weekdays       int[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  start_time     time,
  end_time       time,
  total_limit    int check (total_limit >= 1),
  service_ids    uuid[] not null default '{}',
  is_active      boolean not null default true,
  claimed_count  int not null default 0 check (claimed_count >= 0),
  created_at     timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value between 1 and 90),
  check (ends_on >= starts_on and ends_on - starts_on < 90),
  check ((start_time is null) = (end_time is null) and (start_time is null or start_time < end_time))
);
create index coupons_business_idx on public.coupons (business_id);

-- Müşterinin aldığı kupon ve hesabına özel 6 haneli kodu (claim_coupon yazar). Hesap silinirse customer_id boşalır:
-- rapor sayıları değişmez, kod kullanılamaz. redeemed_at: kasada kullanıldı (redeem_coupon_code). appointment_id:
-- kuponun uygulandığı randevu; kullanılmışlık randevudan hesaplanır (coupon_claim_used), iptal/gelmeme kuponu geri verir.
create table public.coupon_claims (
  id             uuid primary key default gen_random_uuid(),
  coupon_id      uuid not null references public.coupons (id) on delete cascade,
  business_id    uuid not null references public.businesses (id) on delete cascade,
  customer_id    uuid references public.profiles (id) on delete set null,
  code           text not null check (code ~ '^[0-9]{6}$'),
  redeemed_at    timestamptz,
  appointment_id uuid references public.appointments (id) on delete set null,
  -- Vitrinde kasada kullanımdan 2 saat sonra müşteriye "Nasıldı?" haberi gittiği an (claim_coupon_review_requests).
  review_requested_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (coupon_id, customer_id),
  unique (business_id, code)
);
create index coupon_claims_customer_idx on public.coupon_claims (customer_id);
create index coupon_claims_appointment_idx on public.coupon_claims (appointment_id);
-- Dakikada bir çalışan claim_coupon_review_requests "Nasıldı?" bekleyen kuponları bu dizinle bulur.
create index coupon_claims_review_request_idx on public.coupon_claims (redeemed_at)
  where redeemed_at is not null and review_requested_at is null;

-- Randevudaki kupon: price indirimli fiyat, list_price indirimsiz hizmet fiyatı (kuponsuz randevuda null), coupon_claim_id
-- kullanılan kod. book_appointment yazar; istemci elle değiştiremez (protect_appointment_columns). Tablo burada eklenir çünkü
-- coupon_claims da randevuya bağlıdır (appointment_id).
alter table public.appointments
  add column list_price numeric(10, 2),
  add column coupon_claim_id uuid references public.coupon_claims (id) on delete set null;
create index appointments_coupon_claim_idx on public.appointments (coupon_claim_id) where coupon_claim_id is not null;

-- Kasada yanlış girilen kodlar: işletme başına 10 dakikada 20 yanlış denemeden sonra giriş durur
-- (coupon_lookup yazar; hata fırlatılsa kayıt geri alınacağı için yanlış kod hata değil boş sonuç döner).
create table public.coupon_code_attempts (
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index coupon_code_attempts_idx on public.coupon_code_attempts (business_id, created_at);

-- Müşteri değerlendirmesi: tamamlanan her randevu için bir tane (add_review ile eklenir). Vitrin işletmesinde randevu
-- olmadığından kasada kullanılan her kupon için bir tane (add_coupon_review; appointment_id boş, coupon_claim_id dolu).
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid unique references public.appointments (id) on delete cascade,
  coupon_claim_id uuid unique references public.coupon_claims (id) on delete cascade,
  customer_id    uuid references public.profiles (id) on delete set null,
  customer_name  text not null,
  rating         smallint not null check (rating between 1 and 5),
  comment        text not null default '',
  -- İşletmenin herkese açık cevabı (reply_review).
  reply          text not null default '' check (length(reply) <= 1000),
  replied_at     timestamptz,
  -- Kupon yorumunda esnafa "yeni değerlendirme" haberi gittiği an (claim_coupon_review_notices).
  owner_notified_at timestamptz,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(appointment_id, coupon_claim_id) = 1)
);
create index reviews_business_idx on public.reviews (business_id, created_at desc);
-- Müşteri kartı (customer_card) ve hesap silme müşterinin yorumlarını arar.
create index reviews_customer_idx on public.reviews (customer_id, created_at desc);
-- Dakikada bir çalışan claim_coupon_review_notices bekleyen kupon yorumlarını bu dizinle bulur.
create index reviews_coupon_notice_idx on public.reviews (created_at)
  where coupon_claim_id is not null and owner_notified_at is null;

-- Menü (yalnızca 'menu' özelliği olan paket yazabilir: Vitrin). Bir işletmede en fazla 200 ürün (enforce_menu_limit).
-- Görsel yalnızca işletmenin kendi menü klasöründen olabilir.
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category    text not null default '' check (length(category) <= 60),
  name        text not null check (length(trim(name)) > 0 and length(name) <= 100),
  description text not null default '' check (length(description) <= 300),
  price       numeric(10, 2) not null check (price >= 0),
  image_url   text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint menu_items_image_check check (
    image_url is null
    or (public.is_upload_url(image_url) and image_url like '%/businesses/' || business_id || '/menu/%')
  )
);
create index menu_items_business_idx on public.menu_items (business_id, sort_order, created_at);

-- PayTR ödemeleri
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  plan_id      text not null references public.plans (id),
  merchant_oid text not null unique,
  amount       numeric(10, 2) not null,
  -- Ödeme dönemi: 1 ay (30 gün) veya 12 ay (365 gün, 10 ay fiyatına: 2 ay bedava).
  months       int not null default 1 check (months in (1, 12)),
  status       text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index payments_business_idx on public.payments (business_id, created_at desc);

-- Gönderilecek e-postalar. Tetikleyiciler ve queue_due_reminders ekler,
-- sunucu (/api/notifications) claim_notifications ile alıp gönderir.
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  kind           text not null check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'reminder_soon', 'review')),
  recipient      text not null check (recipient in ('customer', 'business')),
  email          text not null,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts       int not null default 0,
  locked_until   timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  -- Aynı randevu için aynı e-posta iki kez gitmez.
  unique (appointment_id, kind, recipient)
);
create index notifications_pending_idx on public.notifications (created_at) where status = 'pending';

-- Gönderilen hatırlatma aşamaları (1 = bir gün önce, 2 = iki saat önce); queue_due_reminders yazar.
-- Randevunun saati değişince silinir, hatırlatmalar yeni saat için tekrar gider.
create table public.appointment_reminders (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  stage          smallint not null check (stage in (1, 2)),
  sent_at        timestamptz not null default now(),
  primary key (appointment_id, stage)
);

-- Telefonların Expo push adresleri. Uygulama register_push_token ile ekler.
create table public.push_tokens (
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_length check (length(token) <= 200)
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- Uygulama içi bildirimler. Her satır kullanıcının telefonlarına anlık bildirim olarak da
-- gider: sunucu (/api/notifications) claim_push ile alıp Expo'ya iletir.
create table public.inbox (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  appointment_id    uuid not null references public.appointments (id) on delete cascade,
  -- review: müşteriye "hizmet nasıldı?", reviewed: işletmeye yeni değerlendirme
  kind              text not null check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'review', 'reviewed')),
  recipient         text not null check (recipient in ('customer', 'business')),
  title             text not null,
  body              text not null,
  read_at           timestamptz,
  push_status       text not null default 'pending' check (push_status in ('pending', 'sent', 'failed', 'skipped')),
  push_attempts     int not null default 0,
  push_locked_until timestamptz,
  created_at        timestamptz not null default now(),
  unique (appointment_id, kind, recipient)
);
create index inbox_user_idx on public.inbox (user_id, created_at desc);
create index inbox_push_pending_idx on public.inbox (created_at) where push_status = 'pending';

-- İşletmenin online randevusunu engellediği müşteriler (hesap ve/veya telefonun son 10 hanesi).
create table public.blocked_customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  customer_id   uuid references public.profiles (id) on delete cascade,
  phone_key     text check (phone_key ~ '^[0-9]{10}$'),
  customer_name text not null default '',
  created_at    timestamptz not null default now(),
  check (customer_id is not null or phone_key is not null)
);
create index blocked_customers_business_idx on public.blocked_customers (business_id);

-- Personelin kendi çalışma saatleri. Bir gün için kaydı yoksa işletme saatleri geçerlidir.
create table public.staff_hours (
  staff_id   uuid not null references public.staff (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  is_open    boolean not null default true,
  open_time  time not null default '09:00',
  close_time time not null default '19:00',
  primary key (staff_id, weekday),
  check (close_time > open_time)
);

-- İşletmenin müşteri hakkındaki özel notu ("kısa kesim sever"). Telefonun son 10 hanesine bağlı.
create table public.customer_notes (
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone_key   text not null check (phone_key ~ '^[0-9]{10}$'),
  note        text not null default '' check (length(note) <= 1000),
  updated_at  timestamptz not null default now(),
  primary key (business_id, phone_key)
);

-- Uygulama hataları (web tarayıcı, web sunucu, mobil); log_error yazar, yalnızca yönetici okur. Dış servise
-- veri gitmez. Aynı hata (kaynak + mesaj + yığının ilk satırı) tek satırda sayılır; tekrar edince çözüldü işareti kalkar.
create table public.error_logs (
  id           uuid primary key default gen_random_uuid(),
  fingerprint  text not null unique,
  source       text not null check (source in ('web', 'server', 'mobile')),
  message      text not null,
  stack        text not null default '',
  url          text not null default '',
  app_version  text not null default '',
  user_agent   text not null default '',
  last_user_id uuid references public.profiles (id) on delete set null,
  count        int not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  resolved_at  timestamptz
);
create index error_logs_last_seen_idx on public.error_logs (last_seen desc);

-- Müşterinin favori işletmeleri.
create table public.favorites (
  customer_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, business_id)
);

-- Dolu güne bekleme listesi (join_waitlist ile yazılır). O gün işletmede bir randevu iptal edilince veya
-- başka saate alınınca bekleyenlere haber gider (e-posta + anlık bildirim); ilk randevu alan kapar.
create table public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  day           date not null,
  -- 'pending': haber gönderilecek (waitlist_on_free_slot yazar), 'sent': gönderildi (claim_waitlist yazar).
  notify_status text check (notify_status in ('pending', 'sent')),
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (business_id, customer_id, day)
);
create index waitlist_pending_idx on public.waitlist (created_at) where notify_status = 'pending';

-- Askı geçmişi (admin_suspend_business yazar). lifted_at boşsa askı sürüyor; lifted_at dolu, lifted_by boşsa süre
-- dolunca kendiliğinden kalktı (lift_due_suspensions). Sahip kendi işletmesininkini görür, not dahil.
create table public.business_suspensions (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  reason                 text not null check (reason in ('kural_ihlali', 'odeme', 'sikayet', 'sahip_talebi', 'diger')),
  note                   text not null default '' check (length(note) <= 500),
  until                  timestamptz,
  appointments_cancelled int not null default 0,
  -- Askıda geçen süre kalkınca aboneliğe eklenir. Askıya alınırken abonelik sürmüyorsa ya da yönetici aboneliği
  -- bitirdiyse (admin_end_subscription) false.
  pause_subscription     boolean not null default false,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  lifted_at              timestamptz,
  lifted_by              uuid references public.profiles (id) on delete set null
);
create unique index business_suspensions_open_idx on public.business_suspensions (business_id) where lifted_at is null;
create index business_suspensions_business_idx on public.business_suspensions (business_id, created_at desc);

-- İşletme sahibinin dondurma talebi (request_freeze yazar). Sahip askıya alamaz; yönetici talebi uygular
-- (admin_suspend_business, p_request_id) ya da gerekçeyle reddeder.
create table public.freeze_requests (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  reason      text not null check (length(trim(reason)) between 3 and 500),
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note  text not null default '' check (length(admin_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create unique index freeze_requests_pending_idx on public.freeze_requests (business_id) where status = 'pending';
create index freeze_requests_business_idx on public.freeze_requests (business_id, created_at desc);

-- Destek talepleri: kullanıcıyla SiftahGo ekibi arasında (randevu alınan işletme görmez). Yazma yalnızca
-- open_support_ticket, reply_support_ticket ve admin_* ile. status: waiting = ekipten yanıt bekliyor, answered = ekip yanıtladı.
-- audience, e-postadaki bağlantıyı seçer: işletmesi onaylı olan panele, diğerleri hesabına döner (onaysız işletmenin paneli kapalı).
create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  business_id     uuid references public.businesses (id) on delete set null,
  audience        text not null check (audience in ('customer', 'business')),
  category        text not null check (category in ('randevu', 'odeme', 'hesap', 'teknik', 'sikayet', 'diger')),
  subject         text not null check (length(subject) between 3 and 120),
  status          text not null default 'waiting' check (status in ('waiting', 'answered', 'closed')),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at       timestamptz
);
create index support_tickets_user_idx on public.support_tickets (user_id, last_message_at desc);
create index support_tickets_status_idx on public.support_tickets (status, last_message_at desc);
create index support_tickets_business_idx on public.support_tickets (business_id);

create table public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  from_admin boolean not null default false,
  body       text not null check (length(body) between 2 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

-- Her mesajın e-postası: kullanıcı yazdıysa ekibe, ekip yazdıysa kullanıcıya. Sunucu (/api/notifications)
-- claim_support_emails ile alıp gönderir. Politika yok: istemciden okunmaz.
create table public.support_emails (
  message_id   uuid primary key references public.support_messages (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts     int not null default 0,
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index support_emails_pending_idx on public.support_emails (created_at) where status = 'pending';

-- ---------------------------------------------------------------------
-- 2) Yardımcı fonksiyonlar ve tetikleyiciler
-- ---------------------------------------------------------------------
create function public.is_business_owner(bid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses where id = bid and owner_id = auth.uid()
  );
$$;

-- İşletme herkese açık mı: onaylı, yayında, askıda değil ve aboneliği süren.
create function public.is_bookable(bid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = bid and approval_status = 'approved' and is_published and not is_suspended and subscription_ends_at > now()
  );
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u join public.admins a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create function public.plan_has_feature(bid uuid, feature text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b join public.plans p on p.id = b.plan_id
    where b.id = bid and b.subscription_ends_at > now() and feature = any (p.features)
  );
$$;

-- Yeni kullanıcı kaydında profil oluştur.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Kayıt formundan gelen bilgi kısaltılır; uzun değer kaydı (auth.users) bozmasın.
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100),
    left(nullif(new.raw_user_meta_data ->> 'phone', ''), 30),
    case when new.raw_user_meta_data ->> 'role' = 'business' then 'business' else 'customer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kullanıcı profilinin kimliğini ve kayıt tarihini değiştiremez: kayıt tarihi işletmeye müşteri kartında
-- "üyelik tarihi" olarak gösterilir (customer_card); geriye alınarak eski üye gibi görünülmesin.
create function public.protect_profile_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Mevcut kullanıcılar için profil oluştur (eski şemadan kalanlar).
insert into public.profiles (id, full_name, phone, role)
select
  u.id,
  left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 100),
  left(nullif(u.raw_user_meta_data ->> 'phone', ''), 30),
  case when u.raw_user_meta_data ->> 'role' = 'business' then 'business' else 'customer' end
from auth.users u
on conflict (id) do nothing;

-- Yeni işletmeye varsayılan çalışma saatleri ve (vitrin değilse) bir personel ekle. Ücretsiz deneme onayla başlar (admin_review_business).
create function public.business_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner_name text;
begin
  insert into public.working_hours (business_id, weekday, is_open, open_time, close_time)
  select new.id, d, d <> 7, '09:00', '19:00'
  from generate_series(1, 7) as d;

  select nullif(trim(full_name), '') into v_owner_name
  from public.profiles where id = new.owner_id;

  if new.business_type = 'appointment' then
    insert into public.staff (business_id, name)
    values (new.id, coalesce(v_owner_name, new.name));
  end if;

  update public.profiles set role = 'business' where id = new.owner_id;
  return new;
end;
$$;

create trigger businesses_after_insert
  after insert on public.businesses
  for each row execute function public.business_after_insert();

-- ---------------------------------------------------------------------
-- 3) Randevu mantığı (web ve mobil aynı fonksiyonları kullanır)
-- ---------------------------------------------------------------------

-- Belirli bir gün için boş saatler. p_staff_id boşsa tüm personel.
-- p_ignore: ertelenen randevu; müşterisi veya işletmesi soruyorsa o randevunun saati boş sayılır.
create function public.get_available_slots(
  p_business_id uuid,
  p_service_id  uuid,
  p_day         date,
  p_staff_id    uuid default null,
  p_ignore      uuid default null
)
returns table (slot_start timestamptz, staff_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  b          public.businesses;
  wh         public.working_hours;
  v_duration interval;
  v_today    date;
begin
  select * into b from public.businesses
  where id = p_business_id and public.is_bookable(id);
  if not found then return; end if;

  select make_interval(mins => s.duration_minutes) into v_duration
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;
  if v_duration is null then return; end if;

  v_today := (now() at time zone b.timezone)::date;
  if p_day < v_today or p_day > v_today + b.booking_days then return; end if;

  select * into wh from public.working_hours
  where business_id = p_business_id and weekday = extract(isodow from p_day);
  if not found or not wh.is_open then return; end if;

  -- Personelin o günkü saatleri: kendi kaydı varsa o, yoksa işletmeninki.
  return query
  select g.s, st.id
  from public.staff st
  left join public.staff_hours sh on sh.staff_id = st.id and sh.weekday = wh.weekday
  cross join lateral generate_series(
         (p_day + coalesce(sh.open_time, wh.open_time)) at time zone b.timezone,
         ((p_day + coalesce(sh.close_time, wh.close_time)) at time zone b.timezone) - v_duration,
         make_interval(mins => b.slot_minutes)
       ) as g(s)
  where st.business_id = p_business_id
    and st.is_active
    and coalesce(sh.is_open, true)
    and (p_staff_id is null or st.id = p_staff_id)
    and (
      not exists (select 1 from public.staff_services ss where ss.staff_id = st.id)
      or exists (select 1 from public.staff_services ss where ss.staff_id = st.id and ss.service_id = p_service_id)
    )
    and g.s >= now() + make_interval(mins => b.min_notice_minutes)
    and not exists (
      select 1 from public.appointments a
      where a.staff_id = st.id
        and a.status in ('pending', 'confirmed')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(g.s, g.s + v_duration)
        and not coalesce(a.id = p_ignore and (a.customer_id = auth.uid() or public.is_business_owner(a.business_id)), false)
    )
    and not exists (
      select 1 from public.time_off t
      where t.business_id = p_business_id
        and (t.staff_id is null or t.staff_id = st.id)
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(g.s, g.s + v_duration)
    )
  order by g.s, st.sort_order, st.created_at;
end;
$$;

-- Müşterinin son 6 aydaki iptal (kendi iptal ettiği) ve gelmediği randevu sayısı.
-- Hesapla alınan randevular yalnızca hesapla eşleşir (tüm işletmelerde). Telefon doğrulanmadığı için telefonla eşleşme
-- yalnızca bu işletmenin elle eklediği (hesapsız) randevularda yapılır: yoksa biri başkasının telefonuyla randevu alıp
-- iptal ederek onu tüm işletmelerde "sık iptal eden müşteri" gösterebilirdi.
create function public.customer_history(p_customer uuid, p_phone text, p_business uuid, out cancels int, out no_shows int)
language sql stable security definer set search_path = ''
as $$
  select
    (count(*) filter (where a.status = 'cancelled' and a.cancelled_by = 'customer'))::int,
    (count(*) filter (where a.status = 'no_show'))::int
  from public.appointments a
  where a.starts_at > now() - interval '180 days'
    and (
      (p_customer is not null and a.customer_id = p_customer)
      or (a.customer_id is null and a.business_id = p_business
          and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
          and right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10))
    );
$$;

-- Randevu yazılırken: geçmiş sayıları ve "sık iptal eden müşteri" işareti (yalnız eklerken),
-- iptal edenin kim olduğu (durum iptale dönünce). İstemci bu alanları elle değiştiremez.
create function public.appointments_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner boolean := public.is_business_owner(new.business_id);
begin
  if tg_op = 'INSERT' then
    select h.cancels, h.no_shows into new.prior_cancels, new.prior_no_shows
    from public.customer_history(new.customer_id, new.customer_phone, new.business_id) h;
    -- Son 6 ayda 3 iptal veya 2 gelmeme: işletme uyarılır, müşterinin aldığı randevu onaya düşer.
    new.customer_flagged := new.prior_cancels >= 3 or new.prior_no_shows >= 2;
    if new.customer_flagged and not v_owner and new.status = 'confirmed' then
      new.status := 'pending';
    end if;
    new.cancelled_by := case when new.status = 'cancelled' then 'business' end;
    new.rejected := false;
  else
    new.prior_cancels := old.prior_cancels;
    new.prior_no_shows := old.prior_no_shows;
    new.customer_flagged := old.customer_flagged;
    new.cancelled_by := case
      when new.status <> 'cancelled' then null
      when old.status = 'cancelled' then old.cancelled_by
      when not v_owner and new.customer_id = auth.uid() then 'customer'
      else 'business'
    end;
    new.rejected := new.status = 'cancelled' and new.cancelled_by = 'business'
                    and (old.status = 'pending' or (old.status = 'cancelled' and old.rejected));
    -- Kodu başka randevuya geçmiş (iptal sonrası yeniden alınmış) bir randevu yeniden etkinleşirse (ör. gelmedi ->
    -- tamamlandı) indirimini ve kupon bağını kaybeder, liste fiyatına döner; hata verilmez, sahibi olanı kaydedebilsin.
    -- İptal edilmiş randevunun kodu kasada kullanıldıysa o randevu yeniden etkinleşince de indirimini kaybeder (tek kod, tek indirim).
    if new.status in ('pending', 'confirmed', 'completed') and new.status is distinct from old.status
       and new.coupon_claim_id is not null
       and (not exists (select 1 from public.coupon_claims cl where cl.id = new.coupon_claim_id and cl.appointment_id = new.id)
            or (old.status = 'cancelled'
                and exists (select 1 from public.coupon_claims cl where cl.id = new.coupon_claim_id and cl.redeemed_at is not null))) then
      new.price := coalesce(old.list_price, new.price);
      new.list_price := null;
      new.coupon_claim_id := null;
    end if;
    -- Saat değişince eski saate ait gecikme haberleri geçersiz: haberler ve sayaçlar sıfırlanır.
    if new.starts_at is distinct from old.starts_at then
      new.customer_late_minutes := null;
      new.customer_late_at := null;
      new.customer_late_count := 0;
      new.business_delay_minutes := null;
      new.business_delay_at := null;
      new.business_delay_count := 0;
    end if;
  end if;
  -- Açıklamayı yalnızca iptal eden işletme yazar.
  new.cancel_reason := case when new.cancelled_by = 'business' then trim(new.cancel_reason) else '' end;
  return new;
end;
$$;

create trigger appointments_before_write
  before insert or update on public.appointments
  for each row execute function public.appointments_before_write();

-- İşletme sahibi randevuyu doğrudan (RLS ile) yazarken: elle eklenen randevu bir müşteri hesabına veya e-postaya
-- bağlanamaz (başkasına bildirim, e-posta gönderilemez); hesap, e-posta, işletme ve paket sonradan değiştirilemez;
-- hesapla alınan randevunun telefonu da değiştirilemez (telefon değiştirilip "gelmedi" denerek başkası engellenemez),
-- saati gelmeden "gelmedi" işaretlenemez;
-- personel ve hizmet aynı işletmenin olmalı (başka işletmenin saatleri doldurulamaz).
-- Fonksiyonlardan (book_appointment vb.) gelen yazmalar etkilenmez: onlar fonksiyon sahibi olarak çalışır.
create function public.protect_appointment_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.customer_id := null;
      new.customer_email := null;
      new.package_id := null;
      new.list_price := null;
      new.coupon_claim_id := null;
      new.customer_late_minutes := null;
      new.customer_late_at := null;
      new.customer_late_count := 0;
      new.business_delay_minutes := null;
      new.business_delay_at := null;
      new.business_delay_count := 0;
    else
      new.business_id := old.business_id;
      new.customer_id := old.customer_id;
      new.customer_email := old.customer_email;
      new.package_id := old.package_id;
      new.list_price := old.list_price;
      new.coupon_claim_id := old.coupon_claim_id;
      new.created_at := old.created_at;
      new.customer_late_minutes := old.customer_late_minutes;
      new.customer_late_at := old.customer_late_at;
      new.customer_late_count := old.customer_late_count;
      new.business_delay_minutes := old.business_delay_minutes;
      new.business_delay_at := old.business_delay_at;
      new.business_delay_count := old.business_delay_count;
      if old.customer_id is not null then
        new.customer_phone := old.customer_phone;
        -- Hesapla alınan yaklaşan randevu "gelmedi" yapılamaz, saati de geçmişe alınamaz: müşterinin gelmeme sayısı
        -- tüm işletmelerde sayıldığı için (customer_history) işletme, randevuyu hemen "gelmedi" işaretleyip müşteriyi
        -- her yerde "sık gelmeyen" gösterebilirdi.
        if new.starts_at is distinct from old.starts_at and new.starts_at <= now() and old.starts_at > now() then
          raise exception 'Randevu geçmiş bir saate alınamaz.';
        end if;
        if new.status = 'no_show' and old.status is distinct from 'no_show' and new.starts_at > now() then
          raise exception 'Randevu saati gelmeden "Gelmedi" işaretlenemez.';
        end if;
      end if;
    end if;
    if new.staff_id is not null and (tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id)
       and not exists (select 1 from public.staff s where s.id = new.staff_id and s.business_id = new.business_id) then
      raise exception 'Personel bulunamadı.';
    end if;
    if new.service_id is not null and (tg_op = 'INSERT' or new.service_id is distinct from old.service_id)
       and not exists (select 1 from public.services s where s.id = new.service_id and s.business_id = new.business_id) then
      raise exception 'Hizmet bulunamadı.';
    end if;
  end if;
  return new;
end;
$$;

-- Tetikleyiciler ada göre sırayla çalışır: bu, appointments_before_write'tan önce çalışmalı (geçmiş sayıları
-- istemcinin yazdığı hesapla değil, gerçek hesapla hesaplansın).
create trigger appointments_access_guard
  before insert or update on public.appointments
  for each row execute function public.protect_appointment_columns();

-- Tamamlanan randevu, müşterinin o hizmetteki en eski açık paketinden bir seans düşer; tamamlanma geri alınırsa
-- seans pakete iade edilir.
create function public.use_package_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pkg uuid;
begin
  -- Kuponlu randevu paketten seans düşmez.
  if new.status = 'completed' and old.status is distinct from 'completed' and new.service_id is not null
     and new.coupon_claim_id is null then
    select p.id into v_pkg
    from public.session_packages p
    where p.business_id = new.business_id
      and p.service_id = new.service_id
      and p.phone_key = right(regexp_replace(new.customer_phone, '\D', '', 'g'), 10)
      and p.used < p.total
    order by p.created_at
    limit 1
    for update;
    if v_pkg is not null then
      update public.session_packages set used = used + 1 where id = v_pkg;
      new.package_id := v_pkg;
    end if;
  elsif old.status = 'completed' and new.status is distinct from 'completed' and old.package_id is not null then
    update public.session_packages set used = greatest(used - 1, 0) where id = old.package_id;
    new.package_id := null;
  end if;
  return new;
end;
$$;

create trigger appointments_use_package_session
  before update of status on public.appointments
  for each row execute function public.use_package_session();

-- Müşterinin randevusu (veya saat değişikliği) işletme onayına düşer mü: elle onayda her zaman; "yalnızca tanıdık
-- müşteriyi otomatik onayla" seçiliyse bu işletmede daha önce tamamlanmış randevusu olmayanda. Sık iptal eden
-- müşteri ayrıca appointments_before_write'ta onaya düşer. İstemciye kapalı (müşterinin ziyaretlerini açığa çıkarır).
create function public.needs_confirmation(p_business public.businesses, p_customer uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select not p_business.auto_confirm
    or (p_business.auto_confirm_known_only and not exists (
      select 1 from public.appointments a
      where a.business_id = p_business.id and a.customer_id = p_customer and a.status = 'completed'
    ));
$$;

-- Girişli müşteri randevu alır. p_staff_id boşsa uygun ilk personel.
-- Sahte randevuya karşı: işletmenin engellediği müşteri alamaz; aynı işletmede en fazla 3, toplamda
-- en fazla 10 yaklaşan randevu; 24 saatte en fazla 10 randevu.
-- Dönen: {id, status, price}. İşletme elle onaylıyorsa, yalnızca tanıdık müşteriyi otomatik onaylıyorsa ve müşteri ilk kez
-- geliyorsa ya da müşteri sık iptal ediyorsa randevu işletme onayına düşer (status = pending).
create function public.book_appointment(
  p_business_id    uuid,
  p_service_id     uuid,
  p_staff_id       uuid,
  p_starts_at      timestamptz,
  p_customer_name  text,
  p_customer_phone text,
  p_note           text default '',
  p_customer_email text default null,
  p_coupon_id      uuid default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b        public.businesses;
  s        public.services;
  c        public.coupons;
  cl       public.coupon_claims;
  v_price  numeric(10, 2);
  v_reason text;
  v_state  text;
  v_uid    uuid := auth.uid();
  v_staff  uuid;
  v_id     uuid;
  v_status text;
  v_phone  text := trim(coalesce(p_customer_phone, ''));
  v_email  text;
begin
  if v_uid is null then
    raise exception 'Randevu almak için giriş yapın.';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Lütfen adınızı girin.';
  end if;
  if length(trim(p_customer_name)) > 100 then
    raise exception 'Adınız en fazla 100 karakter olabilir.';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 or length(v_phone) > 30 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;
  -- E-postalar her zaman hesabın adresine gider: istemcinin yazdığı adrese gitseydi site, başkasının kutusuna
  -- e-posta göndermek için kullanılabilirdi. p_customer_email eski uygulama sürümleri için imzada kalır, kullanılmaz.
  select u.email into v_email from auth.users u where u.id = v_uid;

  select * into b from public.businesses where id = p_business_id and public.is_bookable(id);
  if not found then raise exception 'Bu işletme şu an online randevu almıyor.'; end if;
  if b.business_type = 'showcase' then raise exception 'Bu işletme randevu almıyor.'; end if;

  if exists (
    select 1 from public.blocked_customers bc
    where bc.business_id = b.id
      and (bc.customer_id = v_uid or bc.phone_key = right(regexp_replace(v_phone, '\D', '', 'g'), 10))
  ) then
    raise exception 'Bu işletmeden online randevu alamıyorsunuz. Lütfen işletmeyi arayın.';
  end if;

  if (select count(*) from public.appointments a
      where a.customer_id = v_uid and a.business_id = b.id
        and a.status in ('pending', 'confirmed') and a.starts_at > now()) >= 3 then
    raise exception 'Bu işletmede en fazla 3 yaklaşan randevunuz olabilir.';
  end if;
  if (select count(*) from public.appointments a
      where a.customer_id = v_uid and a.status in ('pending', 'confirmed') and a.starts_at > now()) >= 10 then
    raise exception 'En fazla 10 yaklaşan randevunuz olabilir.';
  end if;
  if (select count(*) from public.appointments a
      where a.customer_id = v_uid and a.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Son 24 saatte çok fazla randevu aldınız, lütfen daha sonra deneyin.';
  end if;

  select * into s from public.services
  where id = p_service_id and business_id = p_business_id and is_active;
  if not found then raise exception 'Hizmet bulunamadı.'; end if;

  -- Kupon: işletmenin kuponu, paketinde kupon varken, bu hizmette ve bu saatte geçerli; kod müşterinin elinde kullanılabilir.
  -- Kupon fiyatı hizmetin güncel fiyatı üzerinden sunucuda hesaplanır.
  if p_coupon_id is not null then
    select * into c from public.coupons where id = p_coupon_id and business_id = b.id;
    if not found or not public.plan_has_feature(b.id, 'coupons') then raise exception 'Kupon bulunamadı.'; end if;
    if s.price <= 0 then raise exception 'Fiyatı olmayan hizmette kupon kullanılamaz.'; end if;
    if cardinality(c.service_ids) > 0 and not (s.id = any (c.service_ids)) then
      raise exception 'Bu kupon seçtiğiniz hizmette geçerli değil.';
    end if;
    v_reason := public.coupon_invalid_reason(c, p_starts_at);
    if v_reason is not null then raise exception '%', v_reason; end if;
    select * into cl from public.coupon_claims where coupon_id = c.id and customer_id = v_uid for update;
    if found then
      v_state := public.coupon_claim_state(cl);
      if v_state = 'used' then raise exception 'Bu kupon zaten kullanıldı.'; end if;
      if v_state = 'attached' then raise exception 'Bu kupon başka bir randevuya bağlı.'; end if;
    end if;
  end if;

  select x.staff_id into v_staff
  from public.get_available_slots(
    p_business_id, p_service_id, (p_starts_at at time zone b.timezone)::date, p_staff_id
  ) x
  where x.slot_start = p_starts_at
  limit 1;

  if v_staff is null then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
  end if;

  v_price := s.price;
  if p_coupon_id is not null then
    -- Henüz alınmamış kupon randevuyla birlikte alınır (sınır ve durdurma kuralları claim_coupon'da).
    if cl.id is null then cl := public.claim_coupon(c.id); end if;
    v_price := public.coupon_price(s.price, c.discount_type, c.discount_value);
  end if;

  insert into public.appointments (
    business_id, service_id, staff_id, customer_id, service_name,
    customer_name, customer_phone, customer_email, note, price, list_price, coupon_claim_id, starts_at, ends_at, status
  ) values (
    b.id, s.id, v_staff, v_uid, s.name,
    trim(p_customer_name), v_phone, v_email, left(coalesce(p_note, ''), 500), v_price,
    case when p_coupon_id is not null then s.price end, cl.id,
    p_starts_at, p_starts_at + make_interval(mins => s.duration_minutes),
    case when public.needs_confirmation(b, v_uid) then 'pending' else 'confirmed' end
  )
  returning id, status into v_id, v_status;

  if p_coupon_id is not null then
    update public.coupon_claims set appointment_id = v_id where id = cl.id;
  end if;

  -- O gün için bekleme listesindeyse artık haber gerekmez.
  delete from public.waitlist w
  where w.customer_id = v_uid and w.business_id = b.id and w.day = (p_starts_at at time zone b.timezone)::date;

  return jsonb_build_object('id', v_id, 'status', v_status, 'price', v_price);
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

-- İşletmenin gelen randevuyu değerlendirmesi için müşteri kartı: üyelik tarihi, bu işletmedeki ve tüm SiftahGo'daki
-- geçmişi, müşterinin işletmelere yazdığı yorumlar (son 10). Yalnızca randevunun işletme sahibi görür. Elle eklenen
-- (hesapsız) randevuda yalnızca bu işletmedeki telefon geçmişi döner: telefon doğrulanmadığı için başka işletmelerle
-- eşleştirilmez (customer_history ile aynı kural).
create function public.customer_card(p_appointment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a     public.appointments;
  v_key text;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found or not public.is_business_owner(a.business_id) then
    raise exception 'Randevu bulunamadı.';
  end if;
  v_key := right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10);

  return jsonb_build_object(
    'member_since', (select p.created_at from public.profiles p where p.id = a.customer_id),
    'here', (
      select jsonb_build_object(
        'completed', count(*) filter (where x.status = 'completed'),
        'cancelled', count(*) filter (where x.status = 'cancelled' and x.cancelled_by = 'customer'),
        'no_show', count(*) filter (where x.status = 'no_show'),
        'last_visit', max(x.starts_at) filter (where x.status = 'completed')
      )
      from public.appointments x
      where x.business_id = a.business_id and x.id <> a.id
        and case
              when a.customer_id is not null then x.customer_id = a.customer_id
              else x.customer_id is null and length(v_key) = 10
                   and right(regexp_replace(x.customer_phone, '\D', '', 'g'), 10) = v_key
            end
    ),
    'platform', case when a.customer_id is not null then (
      select jsonb_build_object(
        'completed', count(*) filter (where x.status = 'completed'),
        'cancelled', count(*) filter (where x.status = 'cancelled' and x.cancelled_by = 'customer'),
        'no_show', count(*) filter (where x.status = 'no_show'),
        'businesses', count(distinct x.business_id) filter (where x.status = 'completed')
      )
      from public.appointments x
      where x.customer_id = a.customer_id and x.id <> a.id
    ) end,
    'reviews', case when a.customer_id is not null then (
      select jsonb_build_object(
        'count', count(*),
        'avg', round(avg(r.rating), 1),
        'latest', coalesce((
          select jsonb_agg(jsonb_build_object(
            'business', b.name, 'rating', l.rating, 'comment', l.comment, 'created_at', l.created_at
          ) order by l.created_at desc)
          from (
            select * from public.reviews r2 where r2.customer_id = a.customer_id order by r2.created_at desc limit 10
          ) l
          join public.businesses b on b.id = l.business_id
        ), '[]')
      )
      from public.reviews r
      where r.customer_id = a.customer_id
    ) end
  );
end;
$$;

-- İşletme, randevunun müşterisini engeller (hesap + telefon) ve müşterinin bu işletmedeki
-- yaklaşan randevularını iptal eder. İptal edilen randevu sayısını döner.
create function public.block_customer(p_appointment_id uuid)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a     public.appointments;
  v_key text;
  v_n   int;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found or not public.is_business_owner(a.business_id) then
    raise exception 'Randevu bulunamadı.';
  end if;
  v_key := right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10);
  if length(v_key) < 10 then v_key := null; end if;
  if a.customer_id is null and v_key is null then
    raise exception 'Bu müşteri engellenemiyor.';
  end if;

  if not exists (
    select 1 from public.blocked_customers bc
    where bc.business_id = a.business_id
      and (bc.customer_id = a.customer_id or bc.phone_key = v_key)
  ) then
    insert into public.blocked_customers (business_id, customer_id, phone_key, customer_name)
    values (a.business_id, a.customer_id, v_key, a.customer_name);
  end if;

  update public.appointments ap set status = 'cancelled'
  where ap.business_id = a.business_id
    and ap.status in ('pending', 'confirmed') and ap.starts_at > now()
    and (ap.customer_id = a.customer_id
         or right(regexp_replace(ap.customer_phone, '\D', '', 'g'), 10) = v_key);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Müşteri kendi gelecekteki randevusunu iptal eder.
create function public.cancel_appointment(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.appointments
  set status = 'cancelled'
  where id = p_id
    and customer_id = auth.uid()
    and status in ('pending', 'confirmed')
    and starts_at > now();
  if not found then
    raise exception 'Bu randevu iptal edilemiyor.';
  end if;
end;
$$;

-- Müşteri hesabını silmeye hazırlar (KVKK silme hakkı; asıl silme /api/account/delete ile auth.users'tan):
-- yaklaşan randevular iptal edilir (işletmeye haber gider), yorumlardaki ad kaldırılır. Randevu kayıtları
-- işletmenin defterinde hesapsız kalır. İşletme sahibinin hesabı burada silinmez.
create function public.delete_my_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  if exists (select 1 from public.businesses b where b.owner_id = v_uid) then
    raise exception 'İşletme hesabı buradan silinemez. Lütfen destek adresimize yazın.';
  end if;
  update public.appointments set status = 'cancelled'
  where customer_id = v_uid and status in ('pending', 'confirmed') and starts_at > now();
  update public.reviews set customer_name = 'Eski üye' where customer_id = v_uid;
  -- Hesabın e-posta adresi işletmelerin defterinde ve gönderim kayıtlarında kalmaz.
  delete from public.notifications n using public.appointments a
  where a.id = n.appointment_id and a.customer_id = v_uid and n.recipient = 'customer';
  update public.appointments set customer_email = null where customer_id = v_uid;
end;
$$;

-- Gelecekteki randevunun saatini değiştirir: müşterisi (girişli) veya işletme sahibi.
-- Yeni saat boş saatlerden olmalı. p_staff_id boşsa uygun ilk personel.
-- Müşteri değiştirdiyse ve randevusu onaya düşecek bir müşteriyse (needs_confirmation) randevu yeniden onay bekler.
create function public.reschedule_appointment(p_id uuid, p_starts_at timestamptz, p_staff_id uuid default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a        public.appointments;
  b        public.businesses;
  v_owner  boolean;
  v_staff  uuid;
  v_mins   int;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Bu randevunun saati değiştirilemiyor.';
  end if;
  v_owner := public.is_business_owner(a.business_id);
  if not (v_owner or coalesce(a.customer_id = auth.uid(), false))
     or a.status not in ('pending', 'confirmed')
     or a.starts_at <= now() then
    raise exception 'Bu randevunun saati değiştirilemiyor.';
  end if;

  select duration_minutes into v_mins from public.services where id = a.service_id;
  if v_mins is null then
    raise exception 'Bu hizmet artık sunulmuyor; saati değiştirmek için işletmeyle görüşün.';
  end if;

  select * into b from public.businesses where id = a.business_id;
  if b.business_type = 'showcase' then raise exception 'Bu işletme randevu almıyor.'; end if;

  -- Kuponlu randevunun yeni saati de kuponun gün ve saat aralığında olmalı; kupon randevuda kalır.
  if a.coupon_claim_id is not null and exists (
    select 1 from public.coupon_claims cl join public.coupons c on c.id = cl.coupon_id
    where cl.id = a.coupon_claim_id and public.coupon_invalid_reason(c, p_starts_at) is not null
  ) then
    raise exception 'Yeni saat kuponun geçerli olduğu aralıkta değil.';
  end if;

  select x.staff_id into v_staff
  from public.get_available_slots(
    a.business_id, a.service_id, (p_starts_at at time zone b.timezone)::date, p_staff_id, a.id
  ) x
  where x.slot_start = p_starts_at
  limit 1;

  if v_staff is null then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
  end if;

  update public.appointments
  set starts_at = p_starts_at,
      ends_at = p_starts_at + make_interval(mins => v_mins),
      staff_id = v_staff,
      status = case when not v_owner and public.needs_confirmation(b, a.customer_id) then 'pending' else a.status end
  where id = a.id;
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

-- Müşteri gerçekleşen randevusunu değerlendirir: tamamlanan veya saati geçmiş onaylı randevu
-- (işletme "Tamamlandı" işaretlemese de). İptal ve gelmedi değerlendirilemez.
create function public.add_review(p_appointment_id uuid, p_rating int, p_comment text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_name text;
begin
  select * into a from public.appointments
  where id = p_appointment_id and customer_id = auth.uid()
    and (status = 'completed' or (status = 'confirmed' and ends_at <= now()));
  if not found then
    raise exception 'Sadece tamamlanan randevularınızı değerlendirebilirsiniz.';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Puan 1 ile 5 arasında olmalı.';
  end if;

  -- "Ahmet Yılmaz" -> "Ahmet Y."
  v_name := split_part(trim(a.customer_name), ' ', 1);
  if position(' ' in trim(a.customer_name)) > 0 then
    v_name := v_name || ' ' || left(split_part(trim(a.customer_name), ' ', 2), 1) || '.';
  end if;

  insert into public.reviews (business_id, appointment_id, customer_id, customer_name, rating, comment)
  values (a.business_id, a.id, auth.uid(), v_name, p_rating, left(trim(coalesce(p_comment, '')), 1000));
exception
  when unique_violation then
    raise exception 'Bu randevuyu zaten değerlendirdiniz.';
end;
$$;

create function public.refresh_business_rating()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := coalesce(new.business_id, old.business_id);
begin
  update public.businesses b
  set rating_avg = coalesce((select round(avg(r.rating), 1) from public.reviews r where r.business_id = v_business), 0),
      rating_count = (select count(*) from public.reviews r where r.business_id = v_business)
  where b.id = v_business;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or delete on public.reviews
  for each row execute function public.refresh_business_rating();

-- İşletme sahibi değerlendirmeye herkese açık cevap yazar; boş cevap cevabı kaldırır.
create function public.reply_review(p_id uuid, p_reply text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reply text := left(trim(coalesce(p_reply, '')), 1000);
begin
  update public.reviews r
  set reply = v_reply, replied_at = case when v_reply = '' then null else now() end
  where r.id = p_id and public.is_business_owner(r.business_id);
  if not found then raise exception 'Bu değerlendirmeye cevap veremezsiniz.'; end if;
end;
$$;

-- İşletme sahibi puan, abonelik, askı ve onay alanlarını elle değiştiremez;
-- bunları sadece refresh_business_rating, apply_subscription ve admin_* fonksiyonları yazar.
-- Tek istisna: reddedilen başvuru yeniden gönderilebilir (approval_status 'rejected' -> 'pending').
-- Yönetici de işletmeyi doğrudan (RLS ile) aynı kurallarla düzenler; işletmenin sahibini değiştiremez.
-- İşletme türü eklemede seçilir, sonradan yalnızca admin_set_business_type değiştirir.
-- Kayıt tarihi de elle yazılamaz (yönetimdeki kayıt tarihi ve dönem istatistikleri buna dayanır).
-- Saat dilimi geçerli olmalı: geçersiz değer tüm işletmelerin ortak işlerini (hatırlatma, bekleme listesi) bozar.
create function public.protect_business_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
      perform now() at time zone new.timezone;
    end if;
    if tg_op = 'INSERT' then
      new.created_at := now();
      new.rating_avg := 0;
      new.rating_count := 0;
      new.plan_id := null;
      new.subscription_ends_at := null;
      new.trial_ends_at := null;
      new.is_suspended := false;
      new.referral_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
      new.referred_by := null;
      new.referral_rewarded_at := null;
      new.approval_status := 'pending';
      new.approval_note := '';
      new.submitted_at := now();
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.id := old.id;
      new.created_at := old.created_at;
      new.owner_id := old.owner_id;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.plan_id := old.plan_id;
      new.subscription_ends_at := old.subscription_ends_at;
      new.trial_ends_at := old.trial_ends_at;
      new.is_suspended := old.is_suspended;
      new.referral_code := old.referral_code;
      new.referred_by := old.referred_by;
      new.referral_rewarded_at := old.referral_rewarded_at;
      new.business_type := old.business_type;
      if old.approval_status = 'rejected' and new.approval_status = 'pending' then
        new.submitted_at := now();
      else
        new.approval_status := old.approval_status;
        new.submitted_at := old.submitted_at;
      end if;
      new.approval_note := old.approval_note;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end;
$$;

create trigger businesses_protect_columns
  before insert or update on public.businesses
  for each row execute function public.protect_business_columns();

-- Paketin personel sınırı (paket yoksa 1 kabul edilir).
create function public.enforce_staff_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit int;
  v_count int;
begin
  if not new.is_active or (tg_op = 'UPDATE' and old.is_active) then
    return new;
  end if;
  select case when b.plan_id is null then 1 else p.staff_limit end into v_limit
  from public.businesses b left join public.plans p on p.id = b.plan_id
  where b.id = new.business_id;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.staff
  where business_id = new.business_id and is_active and id <> new.id;
  if v_count >= v_limit then
    raise exception 'Paketiniz en fazla % aktif personele izin veriyor. Daha fazlası için paketinizi yükseltin.', v_limit;
  end if;
  return new;
end;
$$;

create trigger staff_enforce_limit
  before insert or update of is_active on public.staff
  for each row execute function public.enforce_staff_limit();

-- İşletme sahibi ödeme başlatır; tutar paketten alınır (istemciden değil). p_months: 1 (aylık) veya
-- 12 (yıllık: 10 ay fiyatına, 2 ay bedava).
create function public.create_payment(p_plan_id text, p_months int default 1)
returns table (merchant_oid text, amount numeric, plan_name text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_status text;
  v_type text;
  v_plan public.plans;
  v_oid text;
  v_amount numeric;
begin
  select id, approval_status, business_type into v_business, v_status, v_type from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Önce işletmenizi oluşturun.'; end if;
  -- Reddedilebilecek başvurudan para alınmaz.
  if v_status <> 'approved' then raise exception 'Başvurunuz onaylanınca paket seçebilirsiniz.'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'Paket bulunamadı.'; end if;
  -- Vitrin işletmesi yalnızca Vitrin paketini, randevulu işletme Vitrin dışındakileri alır.
  if v_type = 'showcase' and v_plan.id <> 'vitrin' then
    raise exception 'Vitrin işletmeleri yalnızca Vitrin paketini alabilir.';
  end if;
  if v_type <> 'showcase' and v_plan.id = 'vitrin' then
    raise exception 'Vitrin paketi randevu almayan işletmeler içindir.';
  end if;
  if p_months is null or p_months not in (1, 12) then raise exception 'Geçersiz ödeme dönemi.'; end if;
  -- Her deneme PayTR'de ödeme açar; arka arkaya istekle kayıt şişirilmesin.
  if (select count(*) from public.payments p
      where p.business_id = v_business and p.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Çok fazla ödeme denemesi. Lütfen biraz sonra tekrar deneyin.';
  end if;

  v_amount := v_plan.price * case when p_months = 12 then 10 else 1 end;
  v_oid := 'SG' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || substr(md5(gen_random_uuid()::text), 1, 10);
  insert into public.payments (business_id, plan_id, merchant_oid, amount, months)
  values (v_business, v_plan.id, v_oid, v_amount, p_months);

  return query select v_oid, v_amount, v_plan.name;
end;
$$;

-- Paketi tanımlar ve süreyi kalan süreye ekler. Ödeme bildirimi ve yönetici kullanır.
create function public.apply_subscription(p_business_id uuid, p_plan_id text, p_days int)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_limit int;
begin
  update public.businesses
  set plan_id = p_plan_id,
      subscription_ends_at = greatest(coalesce(subscription_ends_at, now()), now()) + make_interval(days => p_days)
  where id = p_business_id;

  -- Daha küçük pakete geçildiyse fazla personeli pasif yap (en eskiler kalır).
  select staff_limit into v_limit from public.plans where id = p_plan_id;
  if v_limit is not null then
    update public.staff set is_active = false
    where id in (
      select id from public.staff
      where business_id = p_business_id and is_active
      order by sort_order, created_at
      offset v_limit
    );
  end if;
end;
$$;

-- PayTR "başarılı" bildirimi: sadece sunucu (service_role) çağırır.
-- Aynı bildirim tekrar gelirse bir şey yapmaz. Yıllık ödeme 365, aylık 30 gün ekler.
-- Ücretli dönemde paket değişirse kalan süre yeni paketin fiyatına çevrilir (Esnaf'ın kalan 30 günü Pro'da ~19 gün):
-- ucuz paketin yıllığını alıp bir aylık Pro ödemesiyle tüm yıl Pro kullanılamasın. Denemenin kalan günleri aynen eklenir.
-- Davetle gelen işletmenin ilk ödemesinde kendisine ve davet edene 1 ay (30 gün) hediye eklenir.
create function public.activate_subscription(p_merchant_oid text, p_total_amount numeric)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pay public.payments;
  b   public.businesses;
  ref public.businesses;
  v_plan text;
begin
  select * into pay from public.payments where merchant_oid = p_merchant_oid for update;
  if not found then raise exception 'Ödeme bulunamadı: %', p_merchant_oid; end if;
  if pay.status <> 'pending' then return; end if;
  if p_total_amount < pay.amount then
    raise exception 'Ödenen tutar eksik: % < %', p_total_amount, pay.amount;
  end if;

  update public.payments set status = 'paid', paid_at = now() where id = pay.id;
  select * into b from public.businesses where id = pay.business_id for update;
  -- Ödeme sonrası yönetici türü değiştirmişse paket türe uyar: vitrin yalnızca vitrin işletmesinin paketidir.
  v_plan := case when b.business_type = 'showcase' then 'vitrin'
                 when pay.plan_id = 'vitrin' then 'baslangic' else pay.plan_id end;
  if b.plan_id is distinct from v_plan and b.subscription_ends_at > now()
     and b.subscription_ends_at is distinct from b.trial_ends_at then
    update public.businesses
    set subscription_ends_at = now() + (subscription_ends_at - now())
          * ((select p.price from public.plans p where p.id = b.plan_id)
             / (select p.price from public.plans p where p.id = v_plan))::float8
    where id = b.id;
  end if;
  perform public.apply_subscription(pay.business_id, v_plan, case when pay.months = 12 then 365 else 30 end);

  if b.referred_by is not null and b.referral_rewarded_at is null then
    update public.businesses set referral_rewarded_at = now() where id = b.id;
    select * into ref from public.businesses where id = b.referred_by;
    if found then
      perform public.apply_subscription(b.id, v_plan, 30);
      perform public.apply_subscription(ref.id, coalesce(ref.plan_id,
        case when ref.business_type = 'showcase' then 'vitrin' when v_plan = 'vitrin' then 'baslangic' else v_plan end), 30);
    end if;
  end if;
end;
$$;

-- Yeni işletme kendisini davet eden işletmenin kodunu girer: bir kez ve ilk ödemeden önce.
-- Dönen: davet eden işletmenin adı.
create function public.apply_referral(p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b   public.businesses;
  ref public.businesses;
begin
  select * into b from public.businesses where owner_id = auth.uid() for update;
  if not found then raise exception 'Önce işletmenizi oluşturun.'; end if;
  if b.referred_by is not null then raise exception 'Davet kodu zaten girilmiş.'; end if;
  if exists (select 1 from public.payments p where p.business_id = b.id and p.status = 'paid') then
    raise exception 'Davet kodu ilk ödemeden önce girilebilir.';
  end if;
  select * into ref from public.businesses where referral_code = upper(trim(coalesce(p_code, '')));
  if not found or ref.id = b.id then raise exception 'Davet kodu geçersiz.'; end if;

  update public.businesses set referred_by = ref.id where id = b.id;
  return ref.name;
end;
$$;

-- İşletmenin davet ettiği işletmeler: ad, katılma tarihi ve ödülün verildiği tarih (ilk ödemeleri).
create function public.my_referrals()
returns table (name text, created_at timestamptz, rewarded_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.name, r.created_at, r.referral_rewarded_at
  from public.businesses r
  join public.businesses me on me.id = r.referred_by
  where me.owner_id = auth.uid()
  order by r.created_at desc;
$$;

create function public.fail_payment(p_merchant_oid text)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.payments set status = 'failed' where merchant_oid = p_merchant_oid and status = 'pending';
$$;

revoke execute on function public.apply_subscription(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.activate_subscription(text, numeric) from public, anon, authenticated;
revoke execute on function public.fail_payment(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Bildirimler (e-posta, uygulama içi ve anlık bildirim)
-- ---------------------------------------------------------------------

-- "12 Ekim Pazartesi, 14:30" (e-postalardaki biçim)
create function public.format_when(p_at timestamptz, p_tz text)
returns text
language sql stable set search_path = ''
as $$
  select extract(day from l)::int || ' '
    || (array['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos',
              'Eylül', 'Ekim', 'Kasım', 'Aralık'])[extract(month from l)::int] || ' '
    || (array['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'])[extract(isodow from l)::int]
    || ', ' || to_char(l, 'HH24:MI')
  from (select p_at at time zone p_tz as l) t;
$$;

-- Uygulama içi bildirim ekler; eklendiyse 1 döner.
create function public.inbox_insert(p_user uuid, p_kind text, p_recipient text, a public.appointments)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business text;
  v_when     text;
  v_title    text;
  v_body     text;
  v_flagged  boolean := p_recipient = 'business' and p_kind = 'booked' and a.customer_flagged;
  r          public.reviews;
  v_n        int;
begin
  select b.name, public.format_when(a.starts_at, b.timezone) into v_business, v_when
  from public.businesses b where b.id = a.business_id;
  if p_kind = 'reviewed' then
    select * into r from public.reviews where appointment_id = a.id;
  end if;

  v_title := case
    when p_kind = 'reviewed' then 'Yeni değerlendirme: ' || repeat('★', r.rating) || repeat('☆', 5 - r.rating)
    when p_kind = 'review' then 'Hizmet nasıldı?'
    when v_flagged then 'Dikkat: sık iptal eden müşteri'
    when p_recipient = 'business' and p_kind = 'rescheduled' and a.status = 'pending' then 'Saat değişikliği onay bekliyor'
    when p_recipient = 'business' and p_kind = 'rescheduled' then 'Randevu saati değişti'
    when p_kind = 'rescheduled' then 'Randevunuzun saati değişti'
    when p_recipient = 'business' and p_kind = 'cancelled' then 'Randevu iptal edildi'
    when p_recipient = 'business' and a.status = 'pending' then 'Onay bekleyen randevu'
    when p_recipient = 'business' then 'Yeni randevu'
    when p_kind = 'cancelled' and a.rejected then 'Randevu talebiniz onaylanmadı'
    when p_kind = 'cancelled' then 'Randevunuz iptal edildi'
    when p_kind = 'reminder' then 'Randevunuz yaklaşıyor'
    when a.status = 'pending' then 'Randevu talebiniz alındı'
    else 'Randevunuz onaylandı'
  end;

  v_body := case
    when p_kind = 'reviewed' then concat_ws(' · ', r.customer_name, a.service_name, nullif(left(r.comment, 120), ''))
    when p_kind = 'review' then concat_ws(' · ', v_business, a.service_name, 'Puan vermek için dokunun')
    else concat_ws(' · ', case when p_recipient = 'business' then a.customer_name else v_business end,
                   a.service_name, v_when,
                   case when v_flagged then format('Son 6 ayda %s iptal, %s gelmedi', a.prior_cancels, a.prior_no_shows) end,
                   case when v_flagged and a.status = 'pending' then 'Onayınızı bekliyor' end,
                   case when p_kind = 'cancelled' and p_recipient = 'customer' then nullif(a.cancel_reason, '') end)
  end;

  insert into public.inbox (user_id, appointment_id, kind, recipient, title, body)
  values (p_user, a.id, p_kind, p_recipient, v_title, v_body)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Randevu alınınca, onaylanınca, iptal edilince veya saati değişince ilgili tarafa e-posta kuyruğa girer.
-- Uygulama içi bildirim (ve push) sadece karşı tarafa gider: kendi aldığı randevu için
-- müşteriye, kendi eklediği randevu için işletmeye bildirim gitmez.
create function public.queue_appointment_notifications()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner_email text;
  v_owner_id    uuid;
  v_by_owner    boolean := public.is_business_owner(new.business_id);
  v_kind        text;
  v_to          text;
begin
  if new.starts_at <= now() then return null; end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'confirmed') then return null; end if;
    v_kind := 'booked';
    -- İşletme kendi eklediği randevu için kendine e-posta almaz.
    v_to := case when v_by_owner then 'customer' else 'both' end;
  elsif old.status in ('pending', 'confirmed') and new.status = 'cancelled' then
    v_kind := 'cancelled';
    -- İptal edene değil, karşı tarafa haber verilir. Yöneticinin iptali de işletme adına sayılır (askı).
    v_to := case when v_by_owner or new.cancelled_by = 'business' then 'customer' else 'business' end;
  elsif old.status in ('pending', 'confirmed') and new.status in ('pending', 'confirmed')
        and new.starts_at <> old.starts_at then
    v_kind := 'rescheduled';
    v_to := case when v_by_owner then 'customer' else 'business' end;
    -- Her saat değişikliği yeniden bildirilir; hatırlatma ve onay yeni saat için tekrar gidebilir.
    delete from public.notifications
    where appointment_id = new.id and kind in ('rescheduled', 'reminder', 'reminder_soon', 'confirmed');
    delete from public.inbox
    where appointment_id = new.id and kind in ('rescheduled', 'reminder', 'confirmed');
    delete from public.appointment_reminders where appointment_id = new.id;
  elsif old.status = 'pending' and new.status = 'confirmed' then
    v_kind := 'confirmed';
    v_to := 'customer';
  else
    return null;
  end if;

  if v_to in ('customer', 'both') and new.customer_email is not null then
    insert into public.notifications (appointment_id, kind, recipient, email)
    values (new.id, v_kind, 'customer', new.customer_email)
    on conflict do nothing;
  end if;

  if v_to in ('business', 'both') then
    select u.email, u.id into v_owner_email, v_owner_id
    from public.businesses b join auth.users u on u.id = b.owner_id
    where b.id = new.business_id;
    if v_owner_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (new.id, v_kind, 'business', v_owner_email)
      on conflict do nothing;
    end if;
  end if;

  if v_to = 'customer' and new.customer_id is not null then
    perform public.inbox_insert(new.customer_id, v_kind, 'customer', new);
  elsif v_to in ('business', 'both') and v_owner_id is not null then
    perform public.inbox_insert(v_owner_id, v_kind, 'business', new);
  end if;
  return null;
end;
$$;

create trigger appointments_queue_notifications
  after insert or update of status, starts_at on public.appointments
  for each row execute function public.queue_appointment_notifications();

-- Onaylı randevuya iki hatırlatma (e-posta ve uygulama içi): 1 gün önce (en az 24 saat önceden alınan
-- randevuya) ve 2 saat önce (en az 3 saat önceden alınana). 2 saat kalmışsa 1 günlük artık gönderilmez.
-- Uygulamada tek "yaklaşıyor" bildirimi tutulur; 2 saat kala silinip yeniden eklenir, böylece yeni push gider
-- (eski uygulama sürümleri yeni bildirim türlerini tanımaz). Eklenen bildirim sayısını döner.
create function public.queue_due_reminders()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a       public.appointments;
  v_stage smallint;
  v_n     int := 0;
  v_i     int;
begin
  for a in
    select * from public.appointments ap
    where ap.status = 'confirmed'
      and (ap.customer_email is not null or ap.customer_id is not null)
      and ap.starts_at > now()
      and ap.starts_at <= now() + interval '24 hours'
      and ap.created_at <= ap.starts_at - interval '3 hours'
  loop
    v_stage := case
      when a.starts_at <= now() + interval '2 hours' then 2
      when a.created_at <= a.starts_at - interval '24 hours' then 1
    end;
    continue when v_stage is null;
    insert into public.appointment_reminders (appointment_id, stage) values (a.id, v_stage)
    on conflict do nothing;
    get diagnostics v_i = row_count;
    continue when v_i = 0;

    if a.customer_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (a.id, case when v_stage = 1 then 'reminder' else 'reminder_soon' end, 'customer', a.customer_email)
      on conflict do nothing;
      get diagnostics v_i = row_count;
      v_n := v_n + v_i;
    end if;
    if a.customer_id is not null then
      delete from public.inbox where appointment_id = a.id and kind = 'reminder' and recipient = 'customer';
      v_n := v_n + public.inbox_insert(a.customer_id, 'reminder', 'customer', a);
    end if;
  end loop;
  return v_n;
end;
$$;

-- Randevu bittikten 2 saat sonra girişli müşteriye "Hizmet nasıldı?" (e-posta ve uygulama içi) gider.
-- Değerlendirilmiş, iptal edilmiş, gelinmemiş ya da 3 günden eski randevuya gitmez. Eklenen sayıyı döner.
create function public.queue_review_requests()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a   public.appointments;
  v_n int := 0;
  v_i int;
begin
  for a in
    select * from public.appointments ap
    where ap.customer_id is not null
      and ap.status in ('confirmed', 'completed')
      and ap.ends_at <= now() - interval '2 hours'
      and ap.ends_at > now() - interval '3 days'
      and not exists (select 1 from public.reviews r where r.appointment_id = ap.id)
  loop
    if a.customer_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (a.id, 'review', 'customer', a.customer_email)
      on conflict do nothing;
      get diagnostics v_i = row_count;
      v_n := v_n + v_i;
    end if;
    v_n := v_n + public.inbox_insert(a.customer_id, 'review', 'customer', a);
  end loop;
  return v_n;
end;
$$;

-- Yeni değerlendirme işletme sahibine uygulama içi bildirim (ve push) olarak gider.
create function public.review_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_owner uuid;
begin
  -- Kupon yorumunda randevu yok (inbox randevuya bağlıdır); esnafa claim_coupon_review_notices haber verir.
  if new.appointment_id is null then return null; end if;
  select * into a from public.appointments where id = new.appointment_id;
  select owner_id into v_owner from public.businesses where id = new.business_id;
  perform public.inbox_insert(v_owner, 'reviewed', 'business', a);
  return null;
end;
$$;

create trigger reviews_notify_business
  after insert on public.reviews
  for each row execute function public.review_after_insert();

-- Gönderilecek e-postaları randevu ve işletme bilgileriyle birlikte alır.
-- Alınan kayıt 5 dakika kilitlenir; aynı anda çalışan ikinci istek onu almaz.
create function public.claim_notifications(p_limit int default 20)
returns table (
  id               uuid,
  kind             text,
  recipient        text,
  email            text,
  customer_name    text,
  customer_phone   text,
  service_name     text,
  note             text,
  price            numeric,
  starts_at        timestamptz,
  status           text,
  business_name    text,
  business_slug    text,
  business_phone   text,
  business_address text,
  prior_cancels    int,
  prior_no_shows   int,
  customer_flagged boolean,
  cancel_reason    text,
  rejected         boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Artık anlamı kalmayanlar: başlamış randevu, iptal edilen randevunun onayı/hatırlatması;
  -- "hizmet nasıldı?" için değerlendirilmiş, iptal edilmiş veya gelinmemiş randevu.
  update public.notifications n
  set status = 'skipped'
  from public.appointments a
  where a.id = n.appointment_id
    and n.status = 'pending'
    and case
          when n.kind = 'review' then a.status not in ('confirmed', 'completed')
                                   or exists (select 1 from public.reviews r where r.appointment_id = a.id)
          else a.starts_at <= now() or (n.kind <> 'cancelled' and a.status not in ('pending', 'confirmed'))
        end;

  return query
  with picked as (
    select n.id from public.notifications n
    where n.status = 'pending' and (n.locked_until is null or n.locked_until < now())
    order by n.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notifications n
    set locked_until = now() + interval '5 minutes', attempts = n.attempts + 1
    from picked
    where n.id = picked.id
    returning n.*
  )
  select
    c.id, c.kind, c.recipient, c.email,
    a.customer_name, a.customer_phone, a.service_name, a.note, a.price, a.starts_at, a.status,
    b.name, b.slug, b.phone,
    concat_ws(', ', nullif(b.address, ''), nullif(b.district, ''), nullif(b.city, '')),
    a.prior_cancels, a.prior_no_shows, a.customer_flagged, a.cancel_reason, a.rejected
  from claimed c
  join public.appointments a on a.id = c.appointment_id
  join public.businesses b on b.id = a.business_id
  order by c.created_at;
end;
$$;

-- Gönderim sonucu. Hata varsa kilit süresi dolunca tekrar denenir; 5 denemeden sonra bırakılır.
create function public.finish_notification(p_id uuid, p_error text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.notifications
  set status = case when p_error is null then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when p_error is null then now() end,
      last_error = left(p_error, 500)
  where id = p_id;
$$;

-- Gönderilecek anlık bildirimleri kullanıcının telefon adresleriyle birlikte alır.
-- Telefonu kayıtlı olmayanlar ve anlamı kalmayanlar atlanır; alınan kayıt 5 dakika kilitlenir.
create function public.claim_push(p_limit int default 50)
returns table (
  id             uuid,
  kind           text,
  recipient      text,
  appointment_id uuid,
  title          text,
  body           text,
  tokens         text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.inbox i
  set push_status = 'skipped'
  from public.appointments a
  where a.id = i.appointment_id
    and i.push_status = 'pending'
    and (not exists (select 1 from public.push_tokens t where t.user_id = i.user_id)
         or case
              when i.kind = 'reviewed' then false
              when i.kind = 'review' then a.status not in ('confirmed', 'completed')
                                       or exists (select 1 from public.reviews r where r.appointment_id = a.id)
              else a.starts_at <= now() or (i.kind <> 'cancelled' and a.status not in ('pending', 'confirmed'))
            end);

  return query
  with picked as (
    select i.id from public.inbox i
    where i.push_status = 'pending' and (i.push_locked_until is null or i.push_locked_until < now())
    order by i.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.inbox i
    set push_locked_until = now() + interval '5 minutes', push_attempts = i.push_attempts + 1
    from picked
    where i.id = picked.id
    returning i.*
  )
  select c.id, c.kind, c.recipient, c.appointment_id, c.title, c.body,
         array(select t.token from public.push_tokens t where t.user_id = c.user_id order by t.token)
  from claimed c
  order by c.created_at;
end;
$$;

-- Gönderim sonucu; finish_notification ile aynı kurallar.
create function public.finish_push(p_id uuid, p_error text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.inbox
  set push_status = case when p_error is null then 'sent' when push_attempts >= 5 then 'failed' else 'pending' end
  where id = p_id;
$$;

-- Expo'nun "DeviceNotRegistered" dediği adresler (uygulama kaldırılmış) silinir.
create function public.drop_push_tokens(p_tokens text[])
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_tokens where token = any (p_tokens);
$$;

-- Telefon adresini giriş yapan kullanıcıya bağlar. Aynı telefonda hesap değişirse adres yeni hesaba geçer.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız.';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- Çıkış yaparken çağrılır.
create function public.unregister_push_token(p_token text)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- Bildirimi okundu yapar; p_id boşsa hepsini.
create function public.mark_inbox_read(p_id uuid default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.inbox set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
$$;

revoke execute on function public.queue_due_reminders() from public, anon, authenticated;
revoke execute on function public.queue_review_requests() from public, anon, authenticated;
-- Başka birinin geçmişini sorgulamak mümkün olmasın; sadece tetikleyici kullanır.
revoke execute on function public.customer_history(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.needs_confirmation(public.businesses, uuid) from public, anon, authenticated;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.inbox_insert(uuid, text, text, public.appointments) from public, anon, authenticated;
revoke execute on function public.claim_push(int) from public, anon, authenticated;
revoke execute on function public.finish_push(uuid, text) from public, anon, authenticated;
revoke execute on function public.drop_push_tokens(text[]) from public, anon, authenticated;
revoke execute on function public.finish_notification(uuid, text) from public, anon, authenticated;

-- Süre dolmuş askıyı kaldırmak ve askıda geçen süreyi aboneliğe eklemek yalnızca aşağıdaki işlemlerin işi.
create function public.lift_suspension(p_business_id uuid, p_by uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s public.business_suspensions;
begin
  update public.business_suspensions set lifted_at = now(), lifted_by = p_by
  where business_id = p_business_id and lifted_at is null
  returning * into s;
  update public.businesses b
  set is_suspended = false,
      subscription_ends_at = case when s.pause_subscription then b.subscription_ends_at + (now() - s.created_at) else b.subscription_ends_at end,
      -- Denemedeki işletme denemede kalsın (subscription_ends_at = trial_ends_at).
      trial_ends_at = case when s.pause_subscription and b.subscription_ends_at = b.trial_ends_at
                           then b.trial_ends_at + (now() - s.created_at) else b.trial_ends_at end
  where b.id = p_business_id;
end;
$$;

-- Zamanlanmış görev (/api/notifications) dakikada bir çağırır.
create function public.lift_due_suspensions()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select business_id from public.business_suspensions where lifted_at is null and until <= now()
  loop
    perform public.lift_suspension(v_id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.lift_suspension(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.lift_due_suspensions() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Yönetici (admin) işlemleri. Her fonksiyon önce is_admin() kontrol eder.
-- ---------------------------------------------------------------------

-- Ödeme almadan (veya elden/havale ödemeyi kaydederek) paket tanımlar ya da süre uzatır.
-- Ödeme geçmişinde "ADM" ile başlayan kayıt olarak görünür.
create function public.admin_grant_subscription(
  p_business_id uuid,
  p_plan_id     text,
  p_days        int,
  p_amount      numeric default 0
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if p_days is null or p_days not between 1 and 3650 then
    raise exception 'Süre 1 ile 3650 gün arasında olmalı.';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Tutar negatif olamaz.'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'Paket bulunamadı.';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'İşletme bulunamadı.';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id and approval_status = 'approved') then
    raise exception 'Önce başvuruyu onaylayın.';
  end if;
  if (p_plan_id = 'vitrin') <> exists (select 1 from public.businesses where id = p_business_id and business_type = 'showcase') then
    raise exception 'Vitrin paketi yalnızca vitrin işletmelerine verilir; vitrin işletmesine başka paket verilemez.';
  end if;

  insert into public.payments (business_id, plan_id, merchant_oid, amount, status, paid_at)
  values (
    p_business_id, p_plan_id,
    'ADM' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || substr(md5(gen_random_uuid()::text), 1, 8),
    p_amount, 'paid', now()
  );
  perform public.apply_subscription(p_business_id, p_plan_id, p_days);
end;
$$;

-- Aboneliği hemen bitirir (paket bilgisi kalır, sayfa yayından düşer).
create function public.admin_end_subscription(p_business_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  update public.businesses set subscription_ends_at = now()
  where id = p_business_id and subscription_ends_at > now();
  -- Bitirilen abonelik askı kalkınca geri uzamasın.
  update public.business_suspensions set pause_subscription = false
  where business_id = p_business_id and lifted_at is null;
end;
$$;

-- İşletmeyi sebebiyle askıya alır. Askıdaki işletme görünmez ve randevu almaz; p_until gelince askı kendiliğinden
-- kalkar. p_cancel_appointments: yaklaşan randevular iptal edilir, müşteriye haber gider. p_request_id: uygulanan
-- dondurma talebi. İptal edilen randevu sayısını döner.
create function public.admin_suspend_business(
  p_business_id         uuid,
  p_reason              text,
  p_note                text default '',
  p_until               timestamptz default null,
  p_cancel_appointments boolean default false,
  p_request_id          uuid default null
)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b       public.businesses;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if b.is_suspended then raise exception 'İşletme zaten askıda.'; end if;
  if p_reason is null or p_reason not in ('kural_ihlali', 'odeme', 'sikayet', 'sahip_talebi', 'diger') then
    raise exception 'Askı sebebini seçin.';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'Not en fazla 500 karakter olabilir.'; end if;
  if p_until is not null and p_until <= now() then raise exception 'Bitiş tarihi ileride olmalı.'; end if;

  if p_request_id is not null then
    update public.freeze_requests set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_request_id and business_id = p_business_id and status = 'pending';
    if not found then raise exception 'Bu talep artık açık değil.'; end if;
  end if;

  -- Önce askı: iptaller bekleme listesine "yer açıldı" haberi göndermesin (waitlist_on_free_slot).
  update public.businesses set is_suspended = true where id = p_business_id;
  if p_cancel_appointments then
    update public.appointments
    set status = 'cancelled', cancel_reason = 'İşletme şu an hizmet vermiyor. Yeni randevu için daha sonra tekrar deneyin.'
    where business_id = p_business_id and status in ('pending', 'confirmed') and starts_at > now();
    get diagnostics v_count = row_count;
  end if;

  insert into public.business_suspensions (business_id, reason, note, until, appointments_cancelled, pause_subscription, created_by)
  values (p_business_id, p_reason, trim(coalesce(p_note, '')), p_until, v_count,
          coalesce(b.subscription_ends_at > now(), false), auth.uid());
  return v_count;
end;
$$;

-- Askıyı kaldırır; askıda geçen süre aboneliğe eklenir. İptal edilmiş randevular geri gelmez.
create function public.admin_lift_suspension(p_business_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id and is_suspended) then
    raise exception 'İşletme askıda değil.';
  end if;
  perform public.lift_suspension(p_business_id, auth.uid());
end;
$$;

-- Eski ekranın aç/kapa düğmesi: yeni web yayınlanana kadar çalışsın diye duruyor.
create function public.admin_set_suspended(p_business_id uuid, p_suspended boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_current boolean;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select is_suspended into v_current from public.businesses where id = p_business_id;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if v_current = p_suspended then return; end if;
  if p_suspended then
    perform public.admin_suspend_business(p_business_id, 'diger');
  else
    perform public.admin_lift_suspension(p_business_id);
  end if;
end;
$$;

-- İşletme sahibi dondurma talebi açar; yönetici uygular ya da gerekçeyle reddeder. Açık talep tek olabilir.
create function public.request_freeze(p_reason text, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b    public.businesses;
  v_id uuid;
begin
  select * into b from public.businesses where owner_id = auth.uid();
  if not found or b.approval_status <> 'approved' then raise exception 'Talep için onaylı bir işletmeniz olmalı.'; end if;
  if b.is_suspended then raise exception 'İşletmeniz zaten askıda.'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Sebep 3 ile 500 karakter arasında olmalı.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_starts_on < (now() at time zone b.timezone)::date then
    raise exception 'Geçerli bir tarih aralığı seçin.';
  end if;
  if exists (select 1 from public.freeze_requests where business_id = b.id and status = 'pending') then
    raise exception 'Açık bir talebiniz var.';
  end if;
  insert into public.freeze_requests (business_id, reason, starts_on, ends_on)
  values (b.id, trim(p_reason), p_starts_on, p_ends_on)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.admin_reject_freeze_request(p_id uuid, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if length(trim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'Ret sebebini yazın.';
  end if;
  update public.freeze_requests
  set status = 'rejected', admin_note = trim(p_note), reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_id and status = 'pending';
  if not found then raise exception 'Bu talep artık açık değil.'; end if;
end;
$$;

-- Destek: mesajı ekler ve e-postasını kuyruğa koyar.
create function public.support_add_message(p_ticket uuid, p_from_admin boolean, p_body text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if length(trim(coalesce(p_body, ''))) not between 2 and 4000 then
    raise exception 'Mesaj 2 ile 4000 karakter arasında olmalı.';
  end if;
  insert into public.support_messages (ticket_id, from_admin, body)
  values (p_ticket, p_from_admin, trim(p_body))
  returning id into v_id;
  insert into public.support_emails (message_id) values (v_id);
end;
$$;

-- Destek: her mesaj e-posta olarak gittiği için kullanıcı başına saatte en fazla 20 mesaj.
create function public.support_check_rate(p_user uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select count(*) from public.support_messages m
      join public.support_tickets t on t.id = m.ticket_id
      where t.user_id = p_user and not m.from_admin and m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Çok sık mesaj gönderdiniz. Lütfen biraz sonra tekrar deneyin.';
  end if;
end;
$$;

create function public.open_support_ticket(p_category text, p_subject text, p_body text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_subject text := regexp_replace(trim(coalesce(p_subject, '')), '\s+', ' ', 'g');
  b         public.businesses;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  if length(v_subject) not between 3 and 120 then raise exception 'Konu 3 ile 120 karakter arasında olmalı.'; end if;
  perform public.support_check_rate(v_uid);
  if (select count(*) from public.support_tickets where user_id = v_uid and status <> 'closed') >= 5 then
    raise exception 'En fazla 5 açık talebiniz olabilir. Var olan talebinizden yazabilirsiniz.';
  end if;
  select * into b from public.businesses where owner_id = v_uid;
  insert into public.support_tickets (user_id, business_id, audience, category, subject)
  values (v_uid, b.id, case when b.approval_status = 'approved' then 'business' else 'customer' end, p_category, v_subject)
  returning id into v_id;
  perform public.support_add_message(v_id, false, p_body);
  return v_id;
end;
$$;

-- Kullanıcı kendi talebine yazar; kapalı talep yeniden açılır.
create function public.reply_support_ticket(p_id uuid, p_body text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform 1 from public.support_tickets where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  perform public.support_check_rate(auth.uid());
  perform public.support_add_message(p_id, false, p_body);
  update public.support_tickets
  set status = 'waiting', closed_at = null, last_message_at = now()
  where id = p_id;
end;
$$;

create function public.admin_reply_support_ticket(p_id uuid, p_body text, p_close boolean default false)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  perform 1 from public.support_tickets where id = p_id for update;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  perform public.support_add_message(p_id, true, p_body);
  update public.support_tickets
  set status = case when p_close then 'closed' else 'answered' end,
      closed_at = case when p_close then now() end,
      last_message_at = now()
  where id = p_id;
end;
$$;

create function public.admin_close_support_ticket(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  update public.support_tickets set status = 'closed', closed_at = now()
  where id = p_id and status <> 'closed';
  if not found then raise exception 'Bu talep zaten kapalı.'; end if;
end;
$$;

-- Gönderilecek destek e-postalarını talep bilgileriyle alır. Alınan kayıt 5 dakika kilitlenir.
create function public.claim_support_emails(p_limit int default 10)
returns table (
  id            uuid,
  ticket_id     uuid,
  from_admin    boolean,
  is_first      boolean,
  user_email    text,
  user_name     text,
  audience      text,
  business_name text,
  category      text,
  subject       text,
  body          text,
  ticket_status text
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select e.message_id from public.support_emails e
    where e.status = 'pending' and (e.locked_until is null or e.locked_until < now())
    order by e.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.support_emails e
    set locked_until = now() + interval '5 minutes', attempts = e.attempts + 1
    from picked
    where e.message_id = picked.message_id
    returning e.message_id, e.created_at
  )
  select
    m.id, t.id, m.from_admin,
    not exists (select 1 from public.support_messages o where o.ticket_id = t.id and o.created_at < m.created_at),
    u.email::text, p.full_name, t.audience, b.name, t.category, t.subject, m.body, t.status
  from claimed c
  join public.support_messages m on m.id = c.message_id
  join public.support_tickets t on t.id = m.ticket_id
  join public.profiles p on p.id = t.user_id
  join auth.users u on u.id = t.user_id
  left join public.businesses b on b.id = t.business_id
  order by c.created_at;
end;
$$;

-- Gönderim sonucu. Hata varsa kilit süresi dolunca tekrar denenir; 5 denemeden sonra bırakılır.
create function public.finish_support_email(p_id uuid, p_error text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.support_emails
  set status = case when p_error is null then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when p_error is null then now() end,
      last_error = left(p_error, 500)
  where message_id = p_id;
$$;

revoke execute on function public.support_add_message(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.support_check_rate(uuid) from public, anon, authenticated;
revoke execute on function public.claim_support_emails(int) from public, anon, authenticated;
revoke execute on function public.finish_support_email(uuid, text) from public, anon, authenticated;

-- İşletme başvurusunu onaylar ya da reddeder (ret sebebi zorunlu, işletme sahibine gösterilir).
-- Onayda işletmenin hiç aboneliği olmadıysa 2 ay ücretsiz deneme başlar: randevulu işletmeye Pro paketin tüm özellikleri,
-- vitrin işletmesine Vitrin paketi.
create function public.admin_review_business(p_business_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select approval_status into v_status from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if v_status = 'approved' then raise exception 'İşletme zaten onaylı.'; end if;

  if p_approve then
    update public.businesses
    set approval_status = 'approved', approval_note = '', reviewed_at = now(), reviewed_by = auth.uid(),
        plan_id = case when subscription_ends_at is null
                       then (case when business_type = 'showcase' then 'vitrin' else 'pro' end) else plan_id end,
        trial_ends_at = case when subscription_ends_at is null then now() + interval '2 months' else trial_ends_at end,
        subscription_ends_at = coalesce(subscription_ends_at, now() + interval '2 months')
    where id = p_business_id;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Ret sebebini yazın.'; end if;
    update public.businesses
    set approval_status = 'rejected', approval_note = left(trim(p_note), 500), reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_business_id;
  end if;
end;
$$;

-- Yönetici işletmenin türünü değiştirir (randevulu <-> vitrin). Yaklaşan aktif randevusu olan işletme vitrine çevrilemez.
-- Hizmetler ve personel silinmez; planı olan işletmenin planı türe göre vitrin ya da baslangic olur, süre aynı kalır.
-- Vitrinden randevuluya dönen işletmenin personeli yoksa varsayılan personel eklenir (aksi halde randevu alamaz).
create function public.admin_set_business_type(p_business_id uuid, p_type text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b            public.businesses;
  v_owner_name text;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if p_type is null or p_type not in ('appointment', 'showcase') then raise exception 'Geçersiz işletme türü.'; end if;
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if b.business_type = p_type then return; end if;

  if p_type = 'showcase' and exists (
    select 1 from public.appointments a
    where a.business_id = b.id and a.status in ('pending', 'confirmed') and a.starts_at > now()
  ) then
    raise exception 'Yaklaşan randevuları olan işletme vitrine çevrilemez; önce randevuları iptal edin.';
  end if;

  update public.businesses
  set business_type = p_type,
      plan_id = case when plan_id is null then null when p_type = 'showcase' then 'vitrin' else 'baslangic' end
  where id = b.id;

  -- Gece yarısını aşan saatler (vitrinde serbest) randevuda geçersiz: kapanış gün sonuna çekilir.
  if p_type = 'appointment' then
    update public.working_hours
    set open_time = least(open_time, '23:00'), close_time = '23:59'
    where business_id = b.id and close_time < open_time;
  end if;

  -- Başlangıç 1 personelle sınırlı: fazla aktif personel pasif olur (apply_subscription ile aynı kural, en eskiler kalır).
  if p_type = 'appointment' and b.plan_id is not null then
    update public.staff set is_active = false
    where id in (
      select id from public.staff
      where business_id = b.id and is_active
      order by sort_order, created_at
      offset (select staff_limit from public.plans where id = 'baslangic')
    );
  end if;
  if p_type = 'appointment' and not exists (select 1 from public.staff where business_id = b.id and is_active) then
    select nullif(trim(full_name), '') into v_owner_name from public.profiles where id = b.owner_id;
    insert into public.staff (business_id, name) values (b.id, coalesce(v_owner_name, b.name));
  end if;
end;
$$;

-- Kullanıcı listesi: hesap bilgileri (auth.users) + profil + işletme. p_id verilirse yalnızca o kullanıcı.
create function public.admin_users(p_id uuid default null)
returns table (
  id                 uuid,
  email              text,
  full_name          text,
  phone              text,
  role               text,
  created_at         timestamptz,
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  is_admin           boolean,
  business_id        uuid,
  business_name      text,
  business_slug      text,
  appointment_count  bigint
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  return query
  select
    u.id, u.email::text, coalesce(p.full_name, ''), p.phone, coalesce(p.role, 'customer'),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    exists (select 1 from public.admins a where a.email = lower(u.email)),
    b.id, b.name, b.slug,
    (select count(*) from public.appointments ap where ap.customer_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.businesses b on b.owner_id = u.id
  where p_id is null or u.id = p_id
  order by u.created_at desc;
end;
$$;

-- Genel bakış sayıları ve son 30 günün günlük serisi (İstanbul günleri).
-- "active", "mrr" ve "by_plan" ücretli abonelikleri sayar; ücretsiz denemedekiler "trial"da.
create function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'businesses', (select count(*) from public.businesses),
    'businesses_30d', (select count(*) from public.businesses where created_at > now() - interval '30 days'),
    'active', (select count(*) from public.businesses
               where subscription_ends_at > now() and subscription_ends_at is distinct from trial_ends_at),
    'trial', (select count(*) from public.businesses
              where subscription_ends_at > now() and subscription_ends_at = trial_ends_at),
    'live', (select count(*) from public.businesses
             where subscription_ends_at > now() and is_published and not is_suspended),
    'suspended', (select count(*) from public.businesses where is_suspended),
    'expiring_7d', (select count(*) from public.businesses
                    where subscription_ends_at > now() and subscription_ends_at <= now() + interval '7 days'),
    'expired', (select count(*) from public.businesses where subscription_ends_at <= now()),
    'never_paid', (select count(*) from public.businesses b
                   where not exists (select 1 from public.payments py where py.business_id = b.id and py.status = 'paid')),
    'mrr', (select coalesce(sum(p.price), 0) from public.businesses b
            join public.plans p on p.id = b.plan_id
            where b.subscription_ends_at > now() and b.subscription_ends_at is distinct from b.trial_ends_at),
    'revenue_total', (select coalesce(sum(amount), 0) from public.payments where status = 'paid'),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.payments
                    where status = 'paid' and paid_at > now() - interval '30 days'),
    'payments_failed_30d', (select count(*) from public.payments
                            where status = 'failed' and created_at > now() - interval '30 days'),
    'appointments', (select count(*) from public.appointments),
    'appointments_30d', (select count(*) from public.appointments where created_at > now() - interval '30 days'),
    'upcoming', (select count(*) from public.appointments
                 where status in ('pending', 'confirmed') and starts_at > now()),
    'gmv_30d', (select coalesce(sum(price), 0) from public.appointments
                where status = 'completed' and starts_at > now() - interval '30 days'),
    'reviews', (select count(*) from public.reviews),
    'by_status', (select coalesce(jsonb_object_agg(status, c), '{}') from (
                    select status, count(*) c from public.appointments group by status) x),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', p.id, 'name', p.name, 'price', p.price,
                  'count', (select count(*) from public.businesses b
                            where b.plan_id = p.id and b.subscription_ends_at > now()
                              and b.subscription_ends_at is distinct from b.trial_ends_at)
                ) order by p.sort_order), '[]') from public.plans p),
    'by_category', (select coalesce(jsonb_object_agg(category, c), '{}') from (
                      select category, count(*) c from public.businesses group by category) x),
    'by_city', (select coalesce(jsonb_object_agg(city, c), '{}') from (
                  select coalesce(nullif(city, ''), '—') city, count(*) c from public.businesses group by 1) x),
    'notifications', jsonb_build_object(
      'pending', (select count(*) from public.notifications where status = 'pending'),
      'failed', (select count(*) from public.notifications where status = 'failed'),
      'sent_24h', (select count(*) from public.notifications
                   where status = 'sent' and sent_at > now() - interval '24 hours')
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d,
        'users', (select count(*) from auth.users u
                  where (u.created_at at time zone 'Europe/Istanbul')::date = d),
        'businesses', (select count(*) from public.businesses b
                       where (b.created_at at time zone 'Europe/Istanbul')::date = d),
        'appointments', (select count(*) from public.appointments a
                         where (a.created_at at time zone 'Europe/Istanbul')::date = d),
        'revenue', (select coalesce(sum(amount), 0) from public.payments py
                    where py.status = 'paid' and (py.paid_at at time zone 'Europe/Istanbul')::date = d)
      ) order by d)
      from (select (v_today - g)::date d from generate_series(0, 29) g) days
    )
  );
end;
$$;

-- Yönetim > Genel Bakış ve Analitik: seçilen dönemin (İstanbul günleri, en fazla 366 gün) ayrıntılı sayıları.
-- "kpi" altındaki her değer {cur: bu dönem, prev: hemen önceki eşit uzunluktaki dönem}. Anlık durum (MRR, aktif
-- abonelik, kuyruk) "snapshot" altında admin_stats'tan gelir. Günlük "mrr": ödemelerin kapsadığı günlere bölünmüş
-- aylık tutar (tahmini; erken yenilemede çakışan günler iki kez sayılır).
create function public.admin_dashboard(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz     constant text := 'Europe/Istanbul';
  v_days   int := p_to - p_from + 1;
  v_start  timestamptz;
  v_end    timestamptz;
  v_pstart timestamptz;
  v_month  date := date_trunc('month', now() at time zone 'Europe/Istanbul')::date;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if p_from is null or p_to is null or p_to < p_from or v_days > 366 then
    raise exception 'Geçersiz tarih aralığı.';
  end if;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;
  v_pstart := (p_from - v_days)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', v_days,
    'snapshot', public.admin_stats() - 'daily',
    'kpi', (
      select jsonb_build_object(
        'users', jsonb_build_object('cur', count(*) filter (where u.created_at >= v_start), 'prev', count(*) filter (where u.created_at < v_start)),
        'customers', jsonb_build_object(
          'cur', count(*) filter (where u.created_at >= v_start and coalesce(p.role, 'customer') = 'customer'),
          'prev', count(*) filter (where u.created_at < v_start and coalesce(p.role, 'customer') = 'customer'))
      )
      from auth.users u left join public.profiles p on p.id = u.id
      where u.created_at >= v_pstart and u.created_at < v_end
    ) || (
      select jsonb_build_object(
        'businesses', jsonb_build_object('cur', count(*) filter (where b.created_at >= v_start), 'prev', count(*) filter (where b.created_at < v_start)),
        'referred', jsonb_build_object(
          'cur', count(*) filter (where b.created_at >= v_start and b.referred_by is not null),
          'prev', count(*) filter (where b.created_at < v_start and b.referred_by is not null))
      )
      from public.businesses b
      where b.created_at >= v_pstart and b.created_at < v_end
    ) || (
      -- Alınan randevular (oluşturulma zamanına göre): toplam ve müşterinin kendi aldığı (online).
      select jsonb_build_object(
        'bookings', jsonb_build_object('cur', count(*) filter (where a.created_at >= v_start), 'prev', count(*) filter (where a.created_at < v_start)),
        'online_bookings', jsonb_build_object(
          'cur', count(*) filter (where a.created_at >= v_start and a.customer_id is not null),
          'prev', count(*) filter (where a.created_at < v_start and a.customer_id is not null))
      )
      from public.appointments a
      where a.created_at >= v_pstart and a.created_at < v_end
    ) || (
      -- Gerçekleşen randevular (randevu saatine göre).
      select jsonb_build_object(
        'appointments', jsonb_build_object(
          'cur', count(*) filter (where a.starts_at >= v_start and a.status <> 'cancelled'),
          'prev', count(*) filter (where a.starts_at < v_start and a.status <> 'cancelled')),
        'completed', jsonb_build_object(
          'cur', count(*) filter (where a.starts_at >= v_start and a.status = 'completed'),
          'prev', count(*) filter (where a.starts_at < v_start and a.status = 'completed')),
        'cancelled', jsonb_build_object(
          'cur', count(*) filter (where a.starts_at >= v_start and a.status = 'cancelled'),
          'prev', count(*) filter (where a.starts_at < v_start and a.status = 'cancelled')),
        'no_show', jsonb_build_object(
          'cur', count(*) filter (where a.starts_at >= v_start and a.status = 'no_show'),
          'prev', count(*) filter (where a.starts_at < v_start and a.status = 'no_show')),
        'total', jsonb_build_object('cur', count(*) filter (where a.starts_at >= v_start), 'prev', count(*) filter (where a.starts_at < v_start)),
        'gmv', jsonb_build_object(
          'cur', coalesce(sum(a.price) filter (where a.starts_at >= v_start and a.status = 'completed'), 0),
          'prev', coalesce(sum(a.price) filter (where a.starts_at < v_start and a.status = 'completed'), 0)),
        'active_customers', jsonb_build_object(
          'cur', count(distinct a.customer_id) filter (where a.starts_at >= v_start and a.status <> 'cancelled'),
          'prev', count(distinct a.customer_id) filter (where a.starts_at < v_start and a.status <> 'cancelled')),
        'active_businesses', jsonb_build_object(
          'cur', count(distinct a.business_id) filter (where a.starts_at >= v_start and a.status <> 'cancelled'),
          'prev', count(distinct a.business_id) filter (where a.starts_at < v_start and a.status <> 'cancelled'))
      )
      from public.appointments a
      where a.starts_at >= v_pstart and a.starts_at < v_end
    ) || (
      select jsonb_build_object(
        'revenue', jsonb_build_object(
          'cur', coalesce(sum(py.amount) filter (where py.status = 'paid' and py.paid_at >= v_start), 0),
          'prev', coalesce(sum(py.amount) filter (where py.status = 'paid' and py.paid_at < v_start), 0)),
        'revenue_paytr', jsonb_build_object(
          'cur', coalesce(sum(py.amount) filter (where py.status = 'paid' and py.paid_at >= v_start and py.merchant_oid not like 'ADM%'), 0),
          'prev', coalesce(sum(py.amount) filter (where py.status = 'paid' and py.paid_at < v_start and py.merchant_oid not like 'ADM%'), 0)),
        'payments', jsonb_build_object(
          'cur', count(*) filter (where py.status = 'paid' and py.paid_at >= v_start),
          'prev', count(*) filter (where py.status = 'paid' and py.paid_at < v_start))
      )
      from public.payments py
      where py.paid_at >= v_pstart and py.paid_at < v_end
    ) || (
      select jsonb_build_object(
        'failed_payments', jsonb_build_object(
          'cur', count(*) filter (where py.status = 'failed' and py.created_at >= v_start),
          'prev', count(*) filter (where py.status = 'failed' and py.created_at < v_start)),
        'payment_attempts', jsonb_build_object(
          'cur', count(*) filter (where py.merchant_oid not like 'ADM%' and py.created_at >= v_start),
          'prev', count(*) filter (where py.merchant_oid not like 'ADM%' and py.created_at < v_start))
      )
      from public.payments py
      where py.created_at >= v_pstart and py.created_at < v_end
    ) || (
      -- İlk ücretli ödemesi bu dönemde olan işletmeler.
      select jsonb_build_object(
        'new_paying', jsonb_build_object('cur', count(*) filter (where f.first_paid >= v_start), 'prev', count(*) filter (where f.first_paid < v_start))
      )
      from (
        select min(py.paid_at) first_paid from public.payments py
        where py.status = 'paid' and py.merchant_oid not like 'ADM%' group by py.business_id
      ) f
      where f.first_paid >= v_pstart and f.first_paid < v_end
    ) || (
      -- Ücretli aboneliği bu dönemde bitip yenilenmeyen (kayıp) ve denemesi bitenler (dönüşen = ödeme yapmış).
      select jsonb_build_object(
        'churned', jsonb_build_object(
          'cur', count(*) filter (where b.subscription_ends_at >= v_start and b.subscription_ends_at < v_end
                                    and b.subscription_ends_at <= now() and b.subscription_ends_at is distinct from b.trial_ends_at),
          'prev', count(*) filter (where b.subscription_ends_at >= v_pstart and b.subscription_ends_at < v_start
                                     and b.subscription_ends_at <= now() and b.subscription_ends_at is distinct from b.trial_ends_at)),
        'trial_ended', jsonb_build_object(
          'cur', count(*) filter (where b.trial_ends_at >= v_start and b.trial_ends_at < v_end and b.trial_ends_at <= now()),
          'prev', count(*) filter (where b.trial_ends_at >= v_pstart and b.trial_ends_at < v_start and b.trial_ends_at <= now())),
        'trial_converted', jsonb_build_object(
          'cur', count(*) filter (where b.trial_ends_at >= v_start and b.trial_ends_at < v_end and b.trial_ends_at <= now() and b.paid),
          'prev', count(*) filter (where b.trial_ends_at >= v_pstart and b.trial_ends_at < v_start and b.trial_ends_at <= now() and b.paid))
      )
      from (
        select b.subscription_ends_at, b.trial_ends_at,
          exists (select 1 from public.payments py where py.business_id = b.id and py.status = 'paid'
                  and py.merchant_oid not like 'ADM%') paid
        from public.businesses b
      ) b
    ) || (
      select jsonb_build_object(
        'reviews', jsonb_build_object('cur', count(*) filter (where r.created_at >= v_start), 'prev', count(*) filter (where r.created_at < v_start)),
        'rating', jsonb_build_object(
          'cur', coalesce(round(avg(r.rating) filter (where r.created_at >= v_start), 2), 0),
          'prev', coalesce(round(avg(r.rating) filter (where r.created_at < v_start), 2), 0))
      )
      from public.reviews r
      where r.created_at >= v_pstart and r.created_at < v_end
    ) || (
      -- Dönemde randevusu olan ve daha önce de gelmiş müşteriler (geri dönen).
      select jsonb_build_object(
        'returning_customers', jsonb_build_object(
          'cur', count(distinct a.customer_id) filter (where a.starts_at >= v_start and exists (
            select 1 from public.appointments e where e.customer_id = a.customer_id and e.starts_at < v_start and e.status <> 'cancelled')),
          'prev', count(distinct a.customer_id) filter (where a.starts_at < v_start and exists (
            select 1 from public.appointments e where e.customer_id = a.customer_id and e.starts_at < v_pstart and e.status <> 'cancelled')))
      )
      from public.appointments a
      where a.starts_at >= v_pstart and a.starts_at < v_end and a.status <> 'cancelled' and a.customer_id is not null
    ),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'users', coalesce(u.c, 0),
        'businesses', coalesce(b.c, 0),
        'bookings', coalesce(a.c, 0),
        'appointments', coalesce(s.c, 0),
        'completed', coalesce(s.done, 0),
        'cancelled', coalesce(s.cancelled, 0),
        'gmv', coalesce(s.gmv, 0),
        'revenue', coalesce(py.amount, 0),
        'payments', coalesce(py.c, 0),
        'mrr', round(coalesce(m.mrr, 0), 2)
      ) order by d.day), '[]')
      from (select (p_from + g)::date as day from generate_series(0, v_days - 1) g) d
      left join (
        select (created_at at time zone v_tz)::date as day, count(*) c from auth.users
        where created_at >= v_start and created_at < v_end group by 1
      ) u on u.day = d.day
      left join (
        select (created_at at time zone v_tz)::date as day, count(*) c from public.businesses
        where created_at >= v_start and created_at < v_end group by 1
      ) b on b.day = d.day
      left join (
        select (created_at at time zone v_tz)::date as day, count(*) c from public.appointments
        where created_at >= v_start and created_at < v_end group by 1
      ) a on a.day = d.day
      left join (
        select (starts_at at time zone v_tz)::date as day,
          count(*) filter (where status <> 'cancelled') c,
          count(*) filter (where status = 'completed') done,
          count(*) filter (where status = 'cancelled') cancelled,
          coalesce(sum(price) filter (where status = 'completed'), 0) gmv
        from public.appointments
        where starts_at >= v_start and starts_at < v_end group by 1
      ) s on s.day = d.day
      left join (
        select (paid_at at time zone v_tz)::date as day, count(*) c, sum(amount) amount from public.payments
        where status = 'paid' and paid_at >= v_start and paid_at < v_end group by 1
      ) py on py.day = d.day
      left join lateral (
        select sum(x.amount / x.months) mrr from public.payments x
        where x.status = 'paid'
          and x.paid_at < (d.day + 1)::timestamp at time zone v_tz
          and x.paid_at + make_interval(days => case when x.months = 12 then 365 else 30 end) > (d.day + 1)::timestamp at time zone v_tz
      ) m on true
    ),

    -- İşletme hunisi: dönemde kayıt olup işletme hesabı açanların ne kadarı her adıma geldi.
    'funnel_business', (
      select jsonb_build_object(
        'signups', count(*),
        'business', count(b.id),
        'setup', count(b.id) filter (where exists (select 1 from public.services s where s.business_id = b.id and s.is_active)),
        'published', count(b.id) filter (where b.is_published),
        'first_booking', count(b.id) filter (where exists (select 1 from public.appointments a where a.business_id = b.id)),
        'paid', count(b.id) filter (where exists (select 1 from public.payments py where py.business_id = b.id
                                                   and py.status = 'paid' and py.merchant_oid not like 'ADM%'))
      )
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.businesses b on b.owner_id = u.id
      where u.created_at >= v_start and u.created_at < v_end and (p.role = 'business' or b.id is not null)
    ),
    -- Müşteri hunisi: dönemde üye olan müşteriler.
    'funnel_customer', (
      select jsonb_build_object(
        'signups', count(*),
        'favorited', count(*) filter (where exists (select 1 from public.favorites f where f.customer_id = u.id)),
        'booked', count(*) filter (where exists (select 1 from public.appointments a where a.customer_id = u.id)),
        'completed', count(*) filter (where exists (select 1 from public.appointments a where a.customer_id = u.id and a.status = 'completed')),
        'returned', count(*) filter (where (select count(*) from public.appointments a where a.customer_id = u.id and a.status <> 'cancelled') >= 2),
        'reviewed', count(*) filter (where exists (select 1 from public.reviews r where r.customer_id = u.id))
      )
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.created_at >= v_start and u.created_at < v_end and coalesce(p.role, 'customer') = 'customer'
        and not exists (select 1 from public.businesses b where b.owner_id = u.id)
    ),

    'status', (
      select coalesce(jsonb_object_agg(x.status, x.c), '{}') from (
        select a.status, count(*) c from public.appointments a
        where a.starts_at >= v_start and a.starts_at < v_end group by a.status
      ) x
    ),
    -- Gün (1 = Pazartesi) × saat yoğunluğu, iptaller hariç.
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('d', x.d, 'h', x.h, 'c', x.c)), '[]') from (
        select extract(isodow from a.starts_at at time zone v_tz)::int d, extract(hour from a.starts_at at time zone v_tz)::int h, count(*) c
        from public.appointments a
        where a.starts_at >= v_start and a.starts_at < v_end and a.status <> 'cancelled'
        group by 1, 2
      ) x
    ),
    -- Müşterinin randevuyu ne kadar önceden aldığı (online randevular).
    'lead_time', (
      select jsonb_build_object(
        'h2', count(*) filter (where x.lead < interval '2 hours'),
        'same_day', count(*) filter (where x.lead >= interval '2 hours' and x.lead < interval '24 hours'),
        'd3', count(*) filter (where x.lead >= interval '24 hours' and x.lead < interval '3 days'),
        'd7', count(*) filter (where x.lead >= interval '3 days' and x.lead < interval '7 days'),
        'more', count(*) filter (where x.lead >= interval '7 days')
      )
      from (
        select a.starts_at - a.created_at lead from public.appointments a
        where a.created_at >= v_start and a.created_at < v_end and a.customer_id is not null
      ) x
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('key', x.k, 'businesses', x.nb, 'appointments', x.na, 'gmv', x.gmv)
                                order by x.na desc, x.nb desc), '[]')
      from (
        select b.category k, count(distinct b.id) nb, count(a.id) na,
          coalesce(sum(a.price) filter (where a.status = 'completed'), 0) gmv
        from public.businesses b
        left join public.appointments a on a.business_id = b.id
          and a.starts_at >= v_start and a.starts_at < v_end and a.status <> 'cancelled'
        group by b.category
      ) x
    ),
    'by_city', (
      select coalesce(jsonb_agg(jsonb_build_object('key', x.k, 'businesses', x.nb, 'appointments', x.na, 'gmv', x.gmv)
                                order by x.na desc, x.nb desc), '[]')
      from (
        select coalesce(nullif(b.city, ''), '—') k, count(distinct b.id) nb, count(a.id) na,
          coalesce(sum(a.price) filter (where a.status = 'completed'), 0) gmv
        from public.businesses b
        left join public.appointments a on a.business_id = b.id
          and a.starts_at >= v_start and a.starts_at < v_end and a.status <> 'cancelled'
        group by 1
      ) x
    ),
    'revenue_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan_id', x.plan_id, 'name', x.name, 'months', x.months,
                                                   'source', x.source, 'count', x.c, 'amount', x.amount)
                                order by x.amount desc), '[]')
      from (
        select py.plan_id, pl.name, py.months, case when py.merchant_oid like 'ADM%' then 'admin' else 'paytr' end source,
          count(*) c, sum(py.amount) amount
        from public.payments py join public.plans pl on pl.id = py.plan_id
        where py.status = 'paid' and py.paid_at >= v_start and py.paid_at < v_end
        group by 1, 2, 3, 4
      ) x
    ),
    'top_businesses', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.appointments desc, x.gmv desc), '[]')
      from (
        select b.id, b.name, b.slug, b.category, b.city, b.rating_avg, b.rating_count,
          count(a.id) appointments,
          coalesce(sum(a.price) filter (where a.status = 'completed'), 0) gmv,
          count(a.id) filter (where a.status = 'no_show') no_shows,
          count(distinct coalesce(a.customer_id::text, right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10))) customers
        from public.businesses b
        join public.appointments a on a.business_id = b.id
        where a.starts_at >= v_start and a.starts_at < v_end and a.status <> 'cancelled'
        group by b.id
        order by appointments desc, gmv desc
        limit 10
      ) x
    ),
    -- Yayında ve aboneliği süren ama 30 gündür randevu almayan işletmeler (kaybedilme riski).
    'at_risk', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.last_booking nulls first), '[]')
      from (
        select b.id, b.name, b.slug, b.city, b.created_at, b.subscription_ends_at,
          b.subscription_ends_at = b.trial_ends_at as trial,
          (select max(a.created_at) from public.appointments a where a.business_id = b.id) last_booking
        from public.businesses b
        where b.subscription_ends_at > now() and b.is_published and not b.is_suspended
          and b.created_at < now() - interval '7 days'
          and not exists (select 1 from public.appointments a where a.business_id = b.id and a.created_at > now() - interval '30 days')
        order by last_booking nulls first
        limit 20
      ) x
    ),
    'ratings', (
      select jsonb_build_object(
        'dist', jsonb_build_object(
          '1', count(*) filter (where r.rating = 1), '2', count(*) filter (where r.rating = 2),
          '3', count(*) filter (where r.rating = 3), '4', count(*) filter (where r.rating = 4),
          '5', count(*) filter (where r.rating = 5)),
        'count', count(*),
        'avg', coalesce(round(avg(r.rating), 2), 0),
        'unanswered', count(*) filter (where r.reply = ''),
        'low', count(*) filter (where r.rating <= 2)
      )
      from public.reviews r
      where r.created_at >= v_start and r.created_at < v_end
    ),
    'engagement', jsonb_build_object(
      'favorites_total', (select count(*) from public.favorites),
      'favorites', (select count(*) from public.favorites f where f.created_at >= v_start and f.created_at < v_end),
      'waitlist', (select count(*) from public.waitlist w where w.created_at >= v_start and w.created_at < v_end),
      'waitlist_notified', (select count(*) from public.waitlist w where w.notified_at >= v_start and w.notified_at < v_end),
      'rescheduled', (select count(distinct n.appointment_id) from public.notifications n
                      where n.kind = 'rescheduled' and n.created_at >= v_start and n.created_at < v_end),
      'referral_rewarded', (select count(*) from public.businesses b
                            where b.referral_rewarded_at >= v_start and b.referral_rewarded_at < v_end),
      'session_packages', (select count(*) from public.session_packages sp where sp.created_at >= v_start and sp.created_at < v_end),
      'blocked', (select count(*) from public.blocked_customers bc where bc.created_at >= v_start and bc.created_at < v_end)
    ),
    'ops', jsonb_build_object(
      'email', (select coalesce(jsonb_object_agg(x.status, x.c), '{}') from (
                  select n.status, count(*) c from public.notifications n
                  where n.created_at >= v_start and n.created_at < v_end group by n.status) x),
      'email_by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'status', x.status, 'count', x.c)), '[]') from (
                          select n.kind, n.status, count(*) c from public.notifications n
                          where n.created_at >= v_start and n.created_at < v_end group by 1, 2) x),
      'email_oldest_pending', (select min(n.created_at) from public.notifications n where n.status = 'pending'),
      'push', (select coalesce(jsonb_object_agg(x.push_status, x.c), '{}') from (
                 select i.push_status, count(*) c from public.inbox i
                 where i.created_at >= v_start and i.created_at < v_end group by 1) x),
      'push_tokens', (select coalesce(jsonb_object_agg(x.platform, x.c), '{}') from (
                        select t.platform, count(*) c from public.push_tokens t group by 1) x),
      'errors_open', (select count(*) from public.error_logs e where e.resolved_at is null),
      'errors_by_source', (select coalesce(jsonb_object_agg(x.source, x.c), '{}') from (
                             select e.source, sum(e.count) c from public.error_logs e
                             where e.last_seen >= v_start and e.last_seen < v_end group by 1) x)
    ),
    -- Kayıt ayına göre son 6 ayın işletme ve müşteri grupları; "active"[k]: k ay sonra randevusu olanlar
    -- (işletme: randevu aldı, müşteri: randevu oluşturdu).
    'cohorts', (
      with months as (
        select (v_month - make_interval(months => g))::date m from generate_series(0, 5) g
      ), biz as (
        select b.id, date_trunc('month', b.created_at at time zone v_tz)::date m from public.businesses b
      ), act as (
        select distinct a.business_id, date_trunc('month', a.created_at at time zone v_tz)::date m from public.appointments a
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', mo.m,
        'size', (select count(*) from biz where biz.m = mo.m),
        'active', (
          select coalesce(jsonb_agg((
            select count(*) from biz join act on act.business_id = biz.id and act.m = (mo.m + make_interval(months => k))::date
            where biz.m = mo.m
          ) order by k), '[]')
          from generate_series(0, 5) k where (mo.m + make_interval(months => k))::date <= v_month
        )
      ) order by mo.m), '[]')
      from months mo
    ),
    'customer_cohorts', (
      with months as (
        select (v_month - make_interval(months => g))::date m from generate_series(0, 5) g
      ), cus as (
        select u.id, date_trunc('month', u.created_at at time zone v_tz)::date m
        from auth.users u left join public.profiles p on p.id = u.id
        where coalesce(p.role, 'customer') = 'customer'
      ), act as (
        select distinct a.customer_id, date_trunc('month', a.created_at at time zone v_tz)::date m
        from public.appointments a where a.customer_id is not null
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', mo.m,
        'size', (select count(*) from cus where cus.m = mo.m),
        'active', (
          select coalesce(jsonb_agg((
            select count(*) from cus join act on act.customer_id = cus.id and act.m = (mo.m + make_interval(months => k))::date
            where cus.m = mo.m
          ) order by k), '[]')
          from generate_series(0, 5) k where (mo.m + make_interval(months => k))::date <= v_month
        )
      ) order by mo.m), '[]')
      from months mo
    )
  );
end;
$$;

-- Yönetim > Genel Bakış canlı akışı: son üyelikler, işletmeler, randevular, ödemeler ve yorumlar (en yeni önce).
create function public.admin_activity(p_limit int default 40)
returns table (kind text, occurred_at timestamptz, title text, detail text, ref_id uuid, slug text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  return query
  select x.kind, x.occurred_at, x.title, x.detail, x.ref_id, x.slug from (
    (select 'user'::text kind, u.created_at as occurred_at, coalesce(nullif(p.full_name, ''), u.email::text) title,
       case when p.role = 'business' then 'İşletme hesabı açtı' else 'Üye oldu' end detail, u.id ref_id, null::text slug
     from auth.users u left join public.profiles p on p.id = u.id
     order by u.created_at desc limit v_limit)
    union all
    (select 'business', b.created_at, b.name, concat_ws(' · ', b.category, nullif(b.city, '')), b.id, b.slug
     from public.businesses b order by b.created_at desc limit v_limit)
    union all
    (select 'appointment', a.created_at, bz.name,
       concat_ws(' · ', a.service_name, a.customer_name, case when a.customer_id is null then 'elle eklendi' end), bz.id, bz.slug
     from public.appointments a join public.businesses bz on bz.id = a.business_id
     order by a.created_at desc limit v_limit)
    union all
    (select 'payment', py.paid_at, bz.name,
       concat_ws(' · ', pl.name, case when py.months = 12 then 'yıllık' else 'aylık' end, py.amount::text || ' ₺',
                 case when py.merchant_oid like 'ADM%' then 'yönetici' end), bz.id, bz.slug
     from public.payments py join public.businesses bz on bz.id = py.business_id join public.plans pl on pl.id = py.plan_id
     where py.status = 'paid' order by py.paid_at desc limit v_limit)
    union all
    (select 'review', r.created_at, bz.name, r.rating::text || '★ ' || left(r.comment, 80), bz.id, bz.slug
     from public.reviews r join public.businesses bz on bz.id = r.business_id
     order by r.created_at desc limit v_limit)
  ) x
  order by x.occurred_at desc
  limit v_limit;
end;
$$;

-- İşletmenin müşteri listesi: telefon numarasına göre gruplanır.
create function public.get_customers(p_business_id uuid)
returns table (
  phone            text,
  name             text,
  total            bigint,
  completed        bigint,
  no_show          bigint,
  cancelled        bigint,
  spent            numeric,
  last_visit       timestamptz,
  next_appointment timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Yetkiniz yok.';
  end if;
  if not public.plan_has_feature(p_business_id, 'customers') then
    raise exception 'Müşteri defteri paketinizde yok.';
  end if;

  return query
  select
    (array_agg(a.customer_phone order by a.starts_at desc))[1],
    (array_agg(a.customer_name order by a.starts_at desc))[1],
    count(*),
    count(*) filter (where a.status = 'completed'),
    count(*) filter (where a.status = 'no_show'),
    count(*) filter (where a.status = 'cancelled'),
    coalesce(sum(a.price) filter (where a.status = 'completed'), 0),
    max(a.starts_at) filter (where a.status = 'completed'),
    min(a.starts_at) filter (where a.status in ('pending', 'confirmed') and a.starts_at > now())
  from public.appointments a
  where a.business_id = p_business_id
  -- Son 10 hane: "0555..." ile "+90555..." aynı müşteri sayılır.
  group by right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10)
  order by max(a.starts_at) desc;
end;
$$;

-- Aynı işletmeye son 6 ayda 2 kez gelmeyen müşteri (hesap veya telefon) online randevudan
-- otomatik engellenir. İşletme engeli Ayarlar'dan kaldırabilir.
create function public.auto_block_no_show()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := right(regexp_replace(new.customer_phone, '\D', '', 'g'), 10);
begin
  if length(v_key) < 10 then v_key := null; end if;
  if exists (
    select 1 from public.blocked_customers bc
    where bc.business_id = new.business_id
      and (bc.customer_id = new.customer_id or bc.phone_key = v_key)
  ) then
    return new;
  end if;
  if (select count(*) from public.appointments a
      where a.business_id = new.business_id
        and a.status = 'no_show'
        and a.starts_at > now() - interval '180 days'
        and (a.customer_id = new.customer_id
             or right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = v_key)) >= 2 then
    insert into public.blocked_customers (business_id, customer_id, phone_key, customer_name)
    values (new.business_id, new.customer_id, v_key, new.customer_name);
  end if;
  return new;
end;
$$;

create trigger appointments_auto_block_no_show
  after update of status on public.appointments
  for each row when (new.status = 'no_show' and old.status is distinct from 'no_show')
  execute function public.auto_block_no_show();

-- Rapor özeti (tarihler işletme saatine göre):
-- doluluk = dolu randevu dakikası / personellerin çalışma dakikası;
-- geri dönen = dönemde gelen müşterilerden daha önce de tamamlanmış randevusu olanlar.
create function public.get_report_summary(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz        text;
  v_capacity  numeric;
  v_booked    numeric;
  v_customers int;
  v_returning int;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Yetkiniz yok.';
  end if;
  if not public.plan_has_feature(p_business_id, 'reports') then
    raise exception 'Raporlar paketinizde yok.';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Geçersiz tarih aralığı.';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;

  select coalesce(sum(extract(epoch from coalesce(sh.close_time, wh.close_time) - coalesce(sh.open_time, wh.open_time)) / 60), 0)
    into v_capacity
  from generate_series(p_from, p_to, interval '1 day') as d(day)
  join public.working_hours wh
    on wh.business_id = p_business_id and wh.weekday = extract(isodow from d.day) and wh.is_open
  join public.staff st on st.business_id = p_business_id and st.is_active
  left join public.staff_hours sh on sh.staff_id = st.id and sh.weekday = wh.weekday
  where coalesce(sh.is_open, true);

  select coalesce(sum(extract(epoch from a.ends_at - a.starts_at) / 60), 0)
    into v_booked
  from public.appointments a
  where a.business_id = p_business_id
    and a.status in ('pending', 'confirmed', 'completed')
    and (a.starts_at at time zone v_tz)::date between p_from and p_to;

  with visits as (
    select right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) as k, min(a.starts_at) as first_at
    from public.appointments a
    where a.business_id = p_business_id
      and a.status in ('confirmed', 'completed')
      and (a.starts_at at time zone v_tz)::date between p_from and p_to
    group by 1
  )
  select count(*)::int,
         (count(*) filter (where exists (
           select 1 from public.appointments p
           where p.business_id = p_business_id and p.status = 'completed'
             and p.starts_at < v.first_at
             and right(regexp_replace(p.customer_phone, '\D', '', 'g'), 10) = v.k
         )))::int
    into v_customers, v_returning
  from visits v;

  return jsonb_build_object(
    'capacity_minutes', round(v_capacity),
    'booked_minutes', round(v_booked),
    'customers', v_customers,
    'returning', v_returning
  );
end;
$$;

-- Girişli müşteri dolu güne bekleme listesine yazılır (aynı gün tekrar yazılırsa bir şey değişmez).
create function public.join_waitlist(p_business_id uuid, p_day date)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b       public.businesses;
  v_uid   uuid := auth.uid();
  v_today date;
begin
  if v_uid is null then
    raise exception 'Bekleme listesi için giriş yapın.';
  end if;
  select * into b from public.businesses where id = p_business_id and public.is_bookable(id);
  if not found then raise exception 'Bu işletme şu an online randevu almıyor.'; end if;
  if b.business_type = 'showcase' then raise exception 'Bu işletme randevu almıyor.'; end if;
  v_today := (now() at time zone b.timezone)::date;
  if p_day is null or p_day < v_today or p_day > v_today + b.booking_days then
    raise exception 'Bu gün için bekleme listesine yazılamazsınız.';
  end if;
  if exists (select 1 from public.blocked_customers bc where bc.business_id = b.id and bc.customer_id = v_uid) then
    raise exception 'Bu işletmeden online randevu alamıyorsunuz. Lütfen işletmeyi arayın.';
  end if;
  if (select count(*) from public.waitlist w where w.customer_id = v_uid and w.day >= v_today) >= 10 then
    raise exception 'En fazla 10 bekleme listesine yazılabilirsiniz.';
  end if;

  insert into public.waitlist (business_id, customer_id, day)
  values (b.id, v_uid, p_day)
  on conflict (business_id, customer_id, day) do nothing;
end;
$$;

-- Saat boşaldı: gelecekteki aktif randevu iptal edildi ya da başka saate/personele alındı. O gün bekleme
-- listesindekilere (iptal eden müşteri hariç) haber kuyruğa girer; aynı kişiye 30 dakikada bir haberden fazlası gitmez.
create function public.waitlist_on_free_slot()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status in ('pending', 'confirmed') and old.starts_at > now()
     and (new.status = 'cancelled' or new.starts_at <> old.starts_at or new.staff_id is distinct from old.staff_id) then
    update public.waitlist w
    set notify_status = 'pending'
    from public.businesses b
    where b.id = old.business_id
      and not b.is_suspended
      and w.business_id = old.business_id
      and w.day = (old.starts_at at time zone b.timezone)::date
      and w.customer_id is distinct from old.customer_id
      and (w.notified_at is null or w.notified_at < now() - interval '30 minutes');
  end if;
  return new;
end;
$$;

create trigger appointments_waitlist_free_slot
  after update of status, starts_at, staff_id on public.appointments
  for each row execute function public.waitlist_on_free_slot();

-- Sunucu (/api/notifications) boşalan saat haberlerini alır. Alınan haber gönderilmiş sayılır (tekrar
-- denenmez); günü geçmiş kayıtlar silinir.
create function public.claim_waitlist(p_limit int default 50)
returns table (
  id            uuid,
  day           date,
  email         text,
  customer_name text,
  business_name text,
  business_slug text,
  tokens        text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  delete from public.waitlist w
  using public.businesses b
  where b.id = w.business_id and w.day < (now() at time zone b.timezone)::date;

  return query
  with picked as (
    select w.id from public.waitlist w
    where w.notify_status = 'pending'
    order by w.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.waitlist w
    set notify_status = 'sent', notified_at = now()
    from picked
    where w.id = picked.id
    returning w.*
  )
  select
    c.id, c.day, u.email::text, p.full_name, b.name, b.slug,
    coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.customer_id), '{}')
  from claimed c
  join public.businesses b on b.id = c.business_id
  join public.profiles p on p.id = c.customer_id
  left join auth.users u on u.id = c.customer_id;
end;
$$;

revoke execute on function public.claim_waitlist(int) from public, anon, authenticated;

-- Müşteri "geç kalacağım" der (5, 10 veya 15 dakika). Randevu saati değişmez; işletmeye haber kuyruğa girer.
-- Randevudan en erken 2 saat önce ve randevu bitmeden verilir; bir randevu için en fazla 3 haber.
create function public.report_customer_late(p_id uuid, p_minutes int)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  if p_minutes is null or p_minutes not in (5, 10, 15) then
    raise exception 'Gecikme süresi 5, 10 veya 15 dakika olmalı.';
  end if;
  select * into a from public.appointments
  where id = p_id and customer_id = auth.uid() and status in ('pending', 'confirmed')
  for update;
  if not found or now() >= a.ends_at then
    raise exception 'Bu randevu için gecikme haberi verilemez.';
  end if;
  if now() < a.starts_at - interval '2 hours' then
    raise exception 'Gecikme haberi randevudan en fazla 2 saat önce verilebilir.';
  end if;
  if a.customer_late_count >= 3 then
    raise exception 'Bir randevu için en fazla 3 gecikme haberi verilebilir.';
  end if;

  update public.appointments
  set customer_late_minutes = p_minutes, customer_late_at = now(), customer_late_count = customer_late_count + 1
  where id = a.id;
  insert into public.delay_notices (appointment_id, recipient, minutes) values (a.id, 'business', p_minutes);
end;
$$;

-- İşletme "gecikmemiz var" der (10, 15, 30 veya 45 dakika): o personelin önümüzdeki 3 saat içindeki aktif
-- randevularına (hesabı olmayan, elle eklenen müşteriler hariç), haber sayısı 3'ü geçmemişse. Saatler değişmez. Haber verilen randevu sayısını döndürür.
create function public.report_business_delay(p_staff_id uuid, p_minutes int)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_n        int;
begin
  select s.business_id into v_business from public.staff s where s.id = p_staff_id;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_minutes is null or p_minutes not in (10, 15, 30, 45) then
    raise exception 'Gecikme süresi 10, 15, 30 veya 45 dakika olmalı.';
  end if;

  with upd as (
    update public.appointments a
    set business_delay_minutes = p_minutes, business_delay_at = now(), business_delay_count = a.business_delay_count + 1
    where a.staff_id = p_staff_id
      and a.status in ('pending', 'confirmed')
      and a.starts_at >= now() and a.starts_at <= now() + interval '3 hours'
      and a.customer_id is not null
      and a.business_delay_count < 3
    returning a.id
  )
  insert into public.delay_notices (appointment_id, recipient, minutes)
  select upd.id, 'customer', p_minutes from upd;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Sunucu (/api/notifications) gecikme haberlerini alır. Alınan haber gönderilmiş sayılır (tekrar denenmez);
-- randevusu bu arada iptal edilen ya da tamamlanan haber gönderilmiş sayılır ama döndürülmez.
-- recipient 'business': işletme sahibinin jetonları; 'customer': müşterinin jetonları ve randevudaki e-posta.
create function public.claim_delay_notices(p_limit int default 50)
returns table (
  id            uuid,
  recipient     text,
  minutes       int,
  email         text,
  customer_name text,
  business_name text,
  business_slug text,
  service_name  text,
  starts_at     timestamptz,
  tokens        text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select n.id from public.delay_notices n
    where n.status = 'pending'
    order by n.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.delay_notices n
    set status = 'sent'
    from picked
    where n.id = picked.id
    returning n.*
  )
  select
    c.id, c.recipient, c.minutes,
    case when c.recipient = 'customer' then a.customer_email end,
    a.customer_name, b.name, b.slug, a.service_name, a.starts_at,
    coalesce((
      select array_agg(t.token) from public.push_tokens t
      where t.user_id = case when c.recipient = 'business' then b.owner_id else a.customer_id end
    ), '{}')
  from claimed c
  join public.appointments a on a.id = c.appointment_id
  join public.businesses b on b.id = a.business_id
  where a.status in ('pending', 'confirmed');
end;
$$;

revoke execute on function public.claim_delay_notices(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Kupon. Bütün yazmalar bu fonksiyonlarla yapılır; tablolarda yazma politikası yoktur.
-- ---------------------------------------------------------------------
-- İndirimli fiyat: yüzde kuruşa yuvarlanır, sabit indirim fiyatı aşarsa 0.
create function public.coupon_price(p_price numeric, p_type text, p_value numeric)
returns numeric
language sql immutable set search_path = ''
as $$
  select case p_type
    when 'percent' then round(p_price * (100 - p_value) / 100, 2)
    else greatest(round(p_price - p_value, 2), 0)
  end;
$$;

-- Kupon p_at anında geçerli değilse sebebi, geçerliyse null (tarih aralığı, gün ve saat; işletmenin saatine göre).
-- Kuponun etkin olup olmamasına bakmaz: durdurma önceden alınmış kodları bozmaz.
create function public.coupon_invalid_reason(c public.coupons, p_at timestamptz)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz    text;
  v_local timestamp;
  v_day   date;
begin
  select timezone into v_tz from public.businesses where id = c.business_id;
  v_local := p_at at time zone coalesce(v_tz, 'Europe/Istanbul');
  v_day := v_local::date;
  if v_day < c.starts_on then return 'Kupon henüz başlamadı.'; end if;
  if v_day > c.ends_on then return 'Kuponun süresi dolmuş.'; end if;
  if cardinality(c.weekdays) > 0 and not (extract(isodow from v_day)::int = any (c.weekdays)) then
    return 'Kupon bu günde geçerli değil.';
  end if;
  if c.start_time is not null and not (v_local::time >= c.start_time and v_local::time < c.end_time) then
    return 'Kupon bu saatte geçerli değil (' || to_char(c.start_time, 'HH24:MI') || '-' || to_char(c.end_time, 'HH24:MI') || ' arası).';
  end if;
  return null;
end;
$$;

create function public.coupon_valid_at(c public.coupons, p_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.coupon_invalid_reason(c, p_at) is null;
$$;

-- Kupon kullanılmış mı: kasada işaretlendi ya da bağlı randevu gerçekleşti (add_review ile aynı kural:
-- tamamlandı ya da saati geçmiş onaylı). Randevu sonradan iptal/gelmedi olursa kendiliğinden false olur.
create function public.coupon_claim_used(cl public.coupon_claims)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select cl.redeemed_at is not null or exists (
    select 1 from public.appointments a
    where a.id = cl.appointment_id and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()))
  );
$$;

-- Müşterinin gözünden durum: used (kullanıldı), attached (aktif bir randevuya bağlı; saati geçmiş onay bekleyen sayılmaz), expired (süresi doldu),
-- unavailable (işletmenin paketinde kupon yok), active.
create function public.coupon_claim_state(cl public.coupon_claims)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ends date;
  v_tz   text;
begin
  if public.coupon_claim_used(cl) then return 'used'; end if;
  -- Saati geçmiş onay bekleyen randevuyu hiçbir iş çözmez: kod sonsuza dek kilitli kalmasın diye bağlı sayılmaz.
  if exists (
    select 1 from public.appointments a
    where a.id = cl.appointment_id and (a.status = 'confirmed' or (a.status = 'pending' and a.ends_at > now()))
  ) then
    return 'attached';
  end if;
  select c.ends_on, b.timezone into v_ends, v_tz
  from public.coupons c join public.businesses b on b.id = c.business_id where c.id = cl.coupon_id;
  if v_ends < (now() at time zone v_tz)::date then return 'expired'; end if;
  -- Paketi kuponu kapsamıyorsa (düştü ya da süresi bitti) alınmış kod beklemeye geçer; paket dönünce kod da döner.
  if not public.plan_has_feature(cl.business_id, 'coupons') then return 'unavailable'; end if;
  return 'active';
end;
$$;

-- Kasada bu kod şimdi kullanılamıyorsa sebebi, kullanılabiliyorsa null.
create function public.coupon_redeem_problem(cl public.coupon_claims)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  c  public.coupons;
  st text;
begin
  if cl.customer_id is null then return 'Kodun sahibinin hesabı silinmiş; bu kupon kullanılamaz.'; end if;
  st := public.coupon_claim_state(cl);
  if st = 'used' then return 'Bu kod zaten kullanıldı.'; end if;
  if st = 'attached' then return 'Bu kupon bir randevuya bağlı; indirim randevuda uygulanır.'; end if;
  if st = 'unavailable' then return 'Bu işletmede kuponlar şu an kullanılamıyor.'; end if;
  select * into c from public.coupons where id = cl.coupon_id;
  return public.coupon_invalid_reason(c, now());
end;
$$;

-- Kasada girilen kodu işletmede arar. Yanlış kod kaydedilir ve boş döner (hata fırlatılsa kayıt geri alınırdı);
-- 10 dakikada 20 yanlış denemeden sonra doğru kod da çok fazla deneme hatası verir. Çağıran sahibi doğrulamalıdır.
create function public.coupon_lookup(p_business_id uuid, p_code text)
returns public.coupon_claims
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  cl     public.coupon_claims;
begin
  delete from public.coupon_code_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.coupon_code_attempts
      where business_id = p_business_id and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Kısa sürede çok fazla yanlış kod denendi; birkaç dakika sonra tekrar deneyin.';
  end if;
  select * into cl from public.coupon_claims where business_id = p_business_id and code = v_code;
  if not found then
    insert into public.coupon_code_attempts (business_id) values (p_business_id);
    return null;
  end if;
  return cl;
end;
$$;

revoke execute on function public.coupon_invalid_reason(public.coupons, timestamptz) from public, anon, authenticated;
revoke execute on function public.coupon_claim_used(public.coupon_claims) from public, anon, authenticated;
revoke execute on function public.coupon_claim_state(public.coupon_claims) from public, anon, authenticated;
revoke execute on function public.coupon_redeem_problem(public.coupon_claims) from public, anon, authenticated;
revoke execute on function public.coupon_lookup(uuid, text) from public, anon, authenticated;

-- Esnaf kupon açar (p_id boş) ya da düzenler. Kuponu Esnaf, Pro ve Vitrin paketleri açabilir. İlk alımdan sonra indirim, gün-saat
-- ve hizmetler değişmez; bitiş yalnızca uzatılır, sınır yalnızca yükseltilir (esnaf müşteriye söz vermiştir).
create function public.save_coupon(
  p_id uuid, p_title text, p_type text, p_value numeric, p_starts date, p_ends date,
  p_weekdays int[], p_start time, p_end time, p_limit int, p_services uuid[]
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b          public.businesses;
  c          public.coupons;
  v_title    text := trim(coalesce(p_title, ''));
  v_days     int[];
  v_services uuid[];
  v_today    date;
  v_id       uuid;
  v_value    numeric := round(p_value, 2);
begin
  select * into b from public.businesses where owner_id = auth.uid();
  if not found then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if b.approval_status <> 'approved' or not public.plan_has_feature(b.id, 'coupons') then
    raise exception '%', case when b.business_type = 'showcase' then 'Kupon açmak için Vitrin paketinizin geçerli olması gerekir.'
                              else 'Kupon açmak için Esnaf veya Pro paketi gerekir.' end;
  end if;
  v_today := (now() at time zone b.timezone)::date;

  if length(v_title) not between 1 and 80 then raise exception 'Kupon başlığı 1 ile 80 karakter arasında olmalı.'; end if;
  if p_type is null or p_type not in ('percent', 'fixed') then raise exception 'İndirim türü yüzde ya da sabit tutar olmalı.'; end if;
  if v_value is null or v_value <= 0 or v_value > 100000 then raise exception 'İndirim değeri 0''dan büyük olmalı.'; end if;
  if p_type = 'percent' and v_value not between 1 and 90 then raise exception 'Yüzde indirim 1 ile 90 arasında olmalı.'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'Bitiş tarihi başlangıçtan önce olamaz.'; end if;
  if p_ends - p_starts + 1 > 90 then raise exception 'Kupon süresi en fazla 90 gün olabilir.'; end if;
  if (p_start is null) <> (p_end is null) or p_start >= p_end then
    raise exception 'Saat aralığı için başlangıç ve bitiş saatini birlikte girin; bitiş başlangıçtan sonra olmalı.';
  end if;
  if p_limit is not null and p_limit < 1 then raise exception 'Toplam sınır en az 1 olmalı.'; end if;
  if exists (select 1 from unnest(coalesce(p_weekdays, '{}')) d where d is null or d not between 1 and 7) then
    raise exception 'Günler 1 (Pazartesi) ile 7 (Pazar) arasında olmalı.';
  end if;
  select coalesce(array_agg(distinct d order by d), '{}') into v_days from unnest(coalesce(p_weekdays, '{}')) d;
  select coalesce(array_agg(distinct s order by s), '{}') into v_services from unnest(coalesce(p_services, '{}')) s;

  if p_id is null then
    if (select count(*) from public.services where id = any (v_services) and business_id = b.id) <> cardinality(v_services) then
      raise exception 'Seçilen hizmetlerden biri bu işletmeye ait değil.';
    end if;
    if p_ends < v_today then raise exception 'Bitiş tarihi geçmişte olamaz.'; end if;
    insert into public.coupons (business_id, title, discount_type, discount_value, starts_on, ends_on, weekdays,
                                start_time, end_time, total_limit, service_ids)
    values (b.id, v_title, p_type, v_value, p_starts, p_ends, v_days, p_start, p_end, p_limit, v_services)
    returning id into v_id;
    return v_id;
  end if;

  select * into c from public.coupons where id = p_id and business_id = b.id for update;
  if not found then raise exception 'Kupon bulunamadı.'; end if;
  -- Silinen hizmet service_ids'te kalır; alınmış kuponda yalnızca kilit karşılaştırması geçerlidir.
  if c.claimed_count = 0 and (select count(*) from public.services where id = any (v_services) and business_id = b.id) <> cardinality(v_services) then
    raise exception 'Seçilen hizmetlerden biri bu işletmeye ait değil.';
  end if;
  if p_ends is distinct from c.ends_on and p_ends < v_today then raise exception 'Bitiş tarihi geçmişte olamaz.'; end if;
  if c.claimed_count > 0 then
    if p_type <> c.discount_type or v_value <> c.discount_value or v_days is distinct from c.weekdays
       or p_start is distinct from c.start_time or p_end is distinct from c.end_time
       or v_services is distinct from (select coalesce(array_agg(distinct s order by s), '{}') from unnest(c.service_ids) s) then
      raise exception 'Kupon alındıktan sonra indirim, gün ve saat aralığı ile hizmetler değiştirilemez.';
    end if;
    if p_ends < c.ends_on then raise exception 'Kupon alındıktan sonra bitiş tarihi kısaltılamaz.'; end if;
    if p_starts > c.starts_on then raise exception 'Kupon alındıktan sonra başlangıç tarihi ileri alınamaz.'; end if;
    if p_limit is not null and (c.total_limit is null or p_limit < c.total_limit) then
      raise exception 'Kupon alındıktan sonra toplam sınır düşürülemez.';
    end if;
  end if;

  update public.coupons
  set title = v_title, discount_type = p_type, discount_value = v_value, starts_on = p_starts, ends_on = p_ends,
      weekdays = v_days, start_time = p_start, end_time = p_end, total_limit = p_limit, service_ids = v_services
  where id = c.id;
  return c.id;
end;
$$;

-- Durdur/yeniden başlat. Durdurulan kupon yeni müşteriye verilmez; önceden alınan kodlar bitiş tarihine kadar çalışır.
create function public.set_coupon_active(p_id uuid, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.coupons where id = p_id;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  update public.coupons set is_active = coalesce(p_active, false) where id = p_id;
end;
$$;

-- Yalnızca hiç alınmamış kupon silinir; alınmışsa durdurulur.
create function public.delete_coupon(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.coupons;
begin
  select * into c from public.coupons where id = p_id for update;
  if not found or not public.is_business_owner(c.business_id) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if c.claimed_count > 0 then
    raise exception 'Alınmış kupon silinemez; kuponu durdurun.';
  end if;
  delete from public.coupons where id = c.id;
end;
$$;

-- Müşteri kuponu alır: hesabına özel 6 haneli kod, kişi başına bir kez. Kupon satırı kilitlenir; sınır aşılamaz.
create function public.claim_coupon(p_coupon_id uuid)
returns public.coupon_claims
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  c       public.coupons;
  v_today date;
  v_code  text;
  v_try   int := 0;
  cl      public.coupon_claims;
begin
  if v_uid is null then raise exception 'Kuponu almak için giriş yapmalısınız.'; end if;
  select * into c from public.coupons where id = p_coupon_id for update;
  if not found or not public.is_bookable(c.business_id) or not public.plan_has_feature(c.business_id, 'coupons') then
    raise exception 'Kupon bulunamadı.';
  end if;
  if not c.is_active then raise exception 'Bu kupon durduruldu.'; end if;
  select (now() at time zone b.timezone)::date into v_today from public.businesses b where b.id = c.business_id;
  if v_today > c.ends_on then raise exception 'Bu kuponun süresi dolmuş.'; end if;
  if v_today < c.starts_on then raise exception 'Bu kupon henüz başlamadı.'; end if;
  if exists (select 1 from public.coupon_claims where coupon_id = c.id and customer_id = v_uid) then
    raise exception 'Bu kuponu zaten aldınız.';
  end if;
  if c.total_limit is not null and c.claimed_count >= c.total_limit then
    raise exception 'Bu kuponun hakkı tükendi.';
  end if;

  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.coupon_claims where business_id = c.business_id and code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then raise exception 'Kod oluşturulamadı, lütfen tekrar deneyin.'; end if;
  end loop;

  insert into public.coupon_claims (coupon_id, business_id, customer_id, code)
  values (c.id, c.business_id, v_uid, v_code)
  returning * into cl;
  update public.coupons set claimed_count = claimed_count + 1 where id = c.id;
  return cl;
exception
  when unique_violation then
    raise exception 'Kupon alınamadı, lütfen tekrar deneyin.';
end;
$$;

-- Kasada kod sorgusu (yalnızca işletme sahibi). Kod yanlışsa null döner. problem boşsa kod şimdi kullanılabilir.
-- state: active | attached | used | expired | unavailable. redeemed_at: kasada kullanılma anı (10 dakika geri alınabilir).
create function public.find_coupon_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl     public.coupon_claims;
  c      public.coupons;
  v_name text;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  cl := public.coupon_lookup(p_business_id, p_code);
  if cl.id is null then return null; end if;
  select * into c from public.coupons where id = cl.coupon_id;
  if cl.customer_id is null then
    v_name := 'Eski üye';
  else
    select coalesce(nullif(trim(full_name), ''), 'Müşteri') into v_name from public.profiles where id = cl.customer_id;
  end if;
  return jsonb_build_object(
    'claim_id', cl.id, 'title', c.title, 'discount_type', c.discount_type, 'discount_value', c.discount_value,
    'redeemed_at', cl.redeemed_at, 'customer_name', v_name, 'state', public.coupon_claim_state(cl), 'problem', public.coupon_redeem_problem(cl)
  );
end;
$$;

-- Kasada kodu kullanılmış sayar (yalnızca işletme sahibi). Yanlış kodda null döner (bkz. coupon_lookup);
-- kullanılamayan kodda sebebi hata olarak verir. Kullanılan kod satırının id'sini döndürür.
create function public.redeem_coupon_code(p_business_id uuid, p_code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl        public.coupon_claims;
  v_problem text;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  cl := public.coupon_lookup(p_business_id, p_code);
  if cl.id is null then return null; end if;
  select * into cl from public.coupon_claims where id = cl.id for update;
  v_problem := public.coupon_redeem_problem(cl);
  if v_problem is not null then raise exception '%', v_problem; end if;
  update public.coupon_claims set redeemed_at = now() where id = cl.id;
  return cl.id;
end;
$$;

-- Yanlış işaretlemeyi 10 dakika içinde geri alır.
create function public.undo_coupon_redeem(p_claim_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl public.coupon_claims;
begin
  select * into cl from public.coupon_claims where id = p_claim_id for update;
  if not found or not public.is_business_owner(cl.business_id) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if cl.redeemed_at is null then raise exception 'Bu kupon kasada kullanılmış olarak işaretlenmemiş.'; end if;
  if exists (select 1 from public.reviews r where r.coupon_claim_id = cl.id) then
    raise exception 'Müşteri bu kupon için değerlendirme yazdı; kullanım geri alınamaz.';
  end if;
  if now() - cl.redeemed_at > interval '10 minutes' then
    raise exception 'Geri alma süresi (10 dakika) geçti.';
  end if;
  update public.coupon_claims set redeemed_at = null where id = cl.id;
end;
$$;

-- Müşterinin kuponları ("Kuponlarım"). Durdurulmuş ya da bitmiş kuponlar da listelenir (coupons RLS'si göstermez).
create function public.my_coupons()
returns table (
  claim_id       uuid,
  code           text,
  claimed_at     timestamptz,
  redeemed_at    timestamptz,
  appointment_id uuid,
  coupon_id      uuid,
  title          text,
  discount_type  text,
  discount_value numeric,
  starts_on      date,
  ends_on        date,
  weekdays       int[],
  start_time     time,
  end_time       time,
  service_ids    uuid[],
  business_id    uuid,
  business_name  text,
  business_slug  text,
  state          text
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select cl.id, cl.code, cl.created_at, cl.redeemed_at, cl.appointment_id, c.id, c.title, c.discount_type,
         c.discount_value, c.starts_on, c.ends_on, c.weekdays, c.start_time, c.end_time, c.service_ids,
         b.id, b.name, b.slug, public.coupon_claim_state(cl)
  from public.coupon_claims cl
  join public.coupons c on c.id = cl.coupon_id
  join public.businesses b on b.id = cl.business_id
  where cl.customer_id = auth.uid()
  order by cl.created_at desc;
end;
$$;

-- Esnaf raporu: kuponlar ve her biri için alınan ve kullanılan sayısı (yalnızca işletme sahibi).
create function public.business_coupons(p_business_id uuid)
returns table (
  id             uuid,
  title          text,
  discount_type  text,
  discount_value numeric,
  starts_on      date,
  ends_on        date,
  weekdays       int[],
  start_time     time,
  end_time       time,
  total_limit    int,
  service_ids    uuid[],
  is_active      boolean,
  created_at     timestamptz,
  claimed        int,
  used           int
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  return query
  select c.id, c.title, c.discount_type, c.discount_value, c.starts_on, c.ends_on, c.weekdays, c.start_time, c.end_time,
         c.total_limit, c.service_ids, c.is_active, c.created_at,
         (select count(*)::int from public.coupon_claims cl where cl.coupon_id = c.id),
         (select count(*)::int from public.coupon_claims cl where cl.coupon_id = c.id and public.coupon_claim_used(cl))
  from public.coupons c
  where c.business_id = p_business_id
  order by c.created_at desc;
end;
$$;

-- Menüde en fazla 200 ürün. İşletme satırı kilitlenir; aynı anda eklenen ürünler sınırı aşamaz.
create function public.enforce_menu_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Ürün başka işletmeye taşınamaz (yoksa hedefin 200 sınırı aşılırdı).
  if tg_op = 'UPDATE' then
    if new.business_id is distinct from old.business_id then
      raise exception 'Ürün başka bir işletmeye taşınamaz.';
    end if;
    return new;
  end if;
  perform 1 from public.businesses where id = new.business_id for update;
  if (select count(*) from public.menu_items where business_id = new.business_id) >= 200 then
    raise exception 'Menüde en fazla 200 ürün olabilir.';
  end if;
  return new;
end;
$$;

create trigger menu_items_limit
  before insert or update of business_id on public.menu_items
  for each row execute function public.enforce_menu_limit();

-- Çalışma saatinde kapanış açılıştan önce (gece yarısını aşan, ör. 18:00-01:00) yalnızca vitrin işletmesinde olur.
-- Randevulu işletmede müsait saat ve kapasite hesabı aynı gün içindeki aralığa dayanır.
create function public.enforce_working_hours()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.close_time < new.open_time
     and (select business_type from public.businesses where id = new.business_id) is distinct from 'showcase' then
    raise exception 'Kapanış saati açılıştan sonra olmalı.';
  end if;
  return new;
end;
$$;

create trigger working_hours_check_overnight
  before insert or update of open_time, close_time on public.working_hours
  for each row execute function public.enforce_working_hours();

-- Vitrin müşterisi kasada kullanılan kuponu değerlendirir: kupon başına bir kez, yalnızca vitrin işletmelerinde
-- (randevulu işletmenin kupon randevusu add_review ile değerlendirilir). Yorumdan sonra kullanım geri alınamaz (undo_coupon_redeem).
create function public.add_coupon_review(p_claim_id uuid, p_rating int, p_comment text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl     public.coupon_claims;
  v_name  text;
  v_type  text;
  v_owner uuid;
begin
  select * into cl from public.coupon_claims where id = p_claim_id and customer_id = auth.uid() for update;
  if not found then raise exception 'Kupon bulunamadı.'; end if;
  if cl.redeemed_at is null then
    raise exception 'Kuponu kasada kullandıktan sonra değerlendirebilirsiniz.';
  end if;
  select business_type, owner_id into v_type, v_owner from public.businesses where id = cl.business_id;
  if v_type is distinct from 'showcase' then
    raise exception 'Kupon yorumu yalnızca vitrin işletmeleri için; randevunuzu değerlendirin.';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Kendi işletmenizi değerlendiremezsiniz.';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Puan 1 ile 5 arasında olmalı.';
  end if;

  -- "Ahmet Yılmaz" -> "Ahmet Y."
  select coalesce(nullif(trim(full_name), ''), 'Müşteri') into v_name from public.profiles where id = cl.customer_id;
  if position(' ' in v_name) > 0 then
    v_name := split_part(v_name, ' ', 1) || ' ' || left(split_part(v_name, ' ', 2), 1) || '.';
  end if;

  insert into public.reviews (business_id, coupon_claim_id, customer_id, customer_name, rating, comment)
  values (cl.business_id, cl.id, cl.customer_id, v_name, p_rating, left(trim(coalesce(p_comment, '')), 1000));
exception
  when unique_violation then
    raise exception 'Bu kuponu zaten değerlendirdiniz.';
end;
$$;

-- Sunucu (/api/notifications) vitrin müşterisine "Nasıldı?" haberi için alır: kasada kullanımdan 2 saat geçmiş,
-- değerlendirilmemiş kuponlar. Bir kupon bir kez döner (review_requested_at). Geri alınan kullanım redeemed_at'i boşaltır.
-- Dönen id kupon kodu satırıdır; tokens müşterinin telefonları.
create function public.claim_coupon_review_requests(p_limit int default 50)
returns table (
  id            uuid,
  email         text,
  customer_name text,
  business_name text,
  business_slug text,
  tokens        text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select cl.id from public.coupon_claims cl
    join public.businesses b on b.id = cl.business_id
    where cl.redeemed_at is not null
      and cl.redeemed_at <= now() - interval '2 hours'
      and cl.redeemed_at > now() - interval '3 days'
      and cl.review_requested_at is null
      and cl.customer_id is not null
      and b.business_type = 'showcase'
      and not exists (select 1 from public.reviews r where r.coupon_claim_id = cl.id)
    order by cl.redeemed_at
    limit p_limit
    for update of cl skip locked
  ), claimed as (
    update public.coupon_claims cl
    set review_requested_at = now()
    from picked
    where cl.id = picked.id
    returning cl.*
  )
  select
    c.id, u.email::text, p.full_name, b.name, b.slug,
    coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.customer_id), '{}')
  from claimed c
  join public.businesses b on b.id = c.business_id
  join public.profiles p on p.id = c.customer_id
  left join auth.users u on u.id = c.customer_id;
end;
$$;

revoke execute on function public.claim_coupon_review_requests(int) from public, anon, authenticated;

-- Sunucu işletme sahibine "Yeni değerlendirme" haberi için kupon yorumlarını alır; bir yorum bir kez döner
-- (owner_notified_at). Randevu yorumları inbox ile gider, burada yer almaz. id yorumun id'si.
create function public.claim_coupon_review_notices(p_limit int default 50)
returns table (
  id            uuid,
  email         text,
  rating        int,
  comment       text,
  customer_name text,
  business_name text,
  business_slug text,
  tokens        text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select r.id from public.reviews r
    where r.coupon_claim_id is not null and r.owner_notified_at is null
    order by r.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.reviews r
    set owner_notified_at = now()
    from picked
    where r.id = picked.id
    returning r.*
  )
  select
    c.id, u.email::text, c.rating::int, c.comment, c.customer_name, b.name, b.slug,
    coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = b.owner_id), '{}')
  from claimed c
  join public.businesses b on b.id = c.business_id
  left join auth.users u on u.id = b.owner_id
  order by c.created_at;
end;
$$;

revoke execute on function public.claim_coupon_review_notices(int) from public, anon, authenticated;

-- Keşfet "Bugün müsait": listedeki işletmelerden (en fazla 60) bugün en kısa hizmetine boş saati olanlar.
create function public.available_today(p_ids uuid[])
returns setof uuid
language sql stable set search_path = ''
as $$
  select b.id
  from public.businesses b
  cross join lateral (
    select s.id from public.services s
    where s.business_id = b.id and s.is_active
    order by s.duration_minutes, s.sort_order
    limit 1
  ) s
  where b.id = any (p_ids[1:60])
    and b.business_type = 'appointment'
    and public.is_bookable(b.id)
    and exists (select 1 from public.get_available_slots(b.id, s.id, (now() at time zone b.timezone)::date));
$$;

-- Keşfet "Yakınımda": konumu girilmiş yayındaki işletmeler, verilen noktaya uzaklığa göre (en fazla 50 km, 60 işletme).
-- Konum saklanmaz; yalnızca sıralamada kullanılır.
create function public.nearby_businesses(
  p_lat      double precision,
  p_lng      double precision,
  p_category text default null,
  p_query    text default null
)
returns table (
  id           uuid,
  slug         text,
  name         text,
  category     text,
  city         text,
  district     text,
  logo_url     text,
  cover_url    text,
  description  text,
  rating_avg   numeric,
  rating_count int,
  distance_km  double precision
)
language sql stable set search_path = ''
as $$
  select * from (
    select
      b.id, b.slug, b.name, b.category, b.city, b.district, b.logo_url, b.cover_url, b.description,
      b.rating_avg, b.rating_count,
      2 * 6371 * asin(sqrt(
        power(sin(radians(b.latitude - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(b.latitude)) * power(sin(radians(b.longitude - p_lng) / 2), 2)
      )) as distance_km
    from public.businesses b
    where b.is_published
      and b.latitude is not null
      and (p_category is null or b.category = p_category)
      and (p_query is null or b.name ilike '%' || p_query || '%')
  ) x
  where x.distance_km <= 50
  order by x.distance_km
  limit 60;
$$;

-- Uygulama hatasını kaydeder (girişsiz de çağrılabilir). Uzun metinler kısaltılır; kötüye kullanıma karşı son
-- 24 saatte en fazla 500 yeni hata türü açılır. 90 günden eski kayıtlar silinir.
create function public.log_error(
  p_source      text,
  p_message     text,
  p_stack       text default '',
  p_url         text default '',
  p_app_version text default '',
  p_user_agent  text default ''
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_message text := left(trim(coalesce(p_message, '')), 1000);
  v_stack   text := left(coalesce(p_stack, ''), 8000);
  v_fp      text;
begin
  if v_message = '' or p_source is null or p_source not in ('web', 'server', 'mobile') then return; end if;
  v_fp := md5(p_source || '|' || v_message || '|' || split_part(v_stack, E'\n', 2));

  update public.error_logs
  set count = count + 1,
      last_seen = now(),
      last_user_id = coalesce(auth.uid(), last_user_id),
      url = left(coalesce(p_url, ''), 500),
      app_version = left(coalesce(p_app_version, ''), 100),
      user_agent = left(coalesce(p_user_agent, ''), 300),
      resolved_at = null
  where fingerprint = v_fp;
  if found then return; end if;

  if (select count(*) from public.error_logs where first_seen > now() - interval '24 hours') >= 500 then return; end if;
  delete from public.error_logs where last_seen < now() - interval '90 days';
  insert into public.error_logs (fingerprint, source, message, stack, url, app_version, user_agent, last_user_id)
  values (
    v_fp, p_source, v_message, v_stack, left(coalesce(p_url, ''), 500),
    left(coalesce(p_app_version, ''), 100), left(coalesce(p_user_agent, ''), 300), auth.uid()
  )
  on conflict (fingerprint) do update set count = public.error_logs.count + 1, last_seen = now();
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Satır düzeyi güvenlik (RLS)
-- ---------------------------------------------------------------------
-- auth.uid() ve is_admin() "(select ...)" içinde: her satırda değil, sorguda bir kez hesaplanır.
-- Politika yok: sadece is_admin() ve admin_* fonksiyonları okur.
alter table public.admins        enable row level security;
alter table public.profiles      enable row level security;
alter table public.businesses    enable row level security;
alter table public.services      enable row level security;
alter table public.staff         enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off      enable row level security;
alter table public.appointments  enable row level security;
alter table public.staff_services enable row level security;
alter table public.reviews        enable row level security;
alter table public.plans          enable row level security;
alter table public.payments       enable row level security;
-- Politika yok: sadece sunucu (service_role) ve yukarıdaki fonksiyonlar erişir.
alter table public.notifications  enable row level security;
alter table public.push_tokens    enable row level security;
alter table public.appointment_reminders enable row level security;
-- Kullanıcı kendi bildirimlerini okur; okundu işaretini mark_inbox_read ile koyar.
alter table public.inbox          enable row level security;

create policy "bildirim: kendininkini okur" on public.inbox
  for select using (user_id = (select auth.uid()));

alter table public.blocked_customers   enable row level security;

-- Engelleme block_customer ile eklenir; işletme listeyi görür ve engeli kaldırır.
create policy "engel: işletme okur" on public.blocked_customers
  for select using (public.is_business_owner(business_id));
create policy "engel: işletme kaldırır" on public.blocked_customers
  for delete using (public.is_business_owner(business_id));

alter table public.staff_hours    enable row level security;
alter table public.customer_notes enable row level security;

create policy "personel saati: herkes okur" on public.staff_hours
  for select using (
    exists (
      select 1 from public.staff s
      where s.id = staff_id and (public.is_bookable(s.business_id) or public.is_business_owner(s.business_id))
    )
  );
create policy "personel saati: sahibi yönetir" on public.staff_hours
  for all using (
    exists (select 1 from public.staff s where s.id = staff_id and public.is_business_owner(s.business_id))
  )
  with check (
    exists (select 1 from public.staff s where s.id = staff_id and public.is_business_owner(s.business_id))
  );

-- Müşteri notu müşteri defterinin parçasıdır: yalnızca işletme, paketinde defter varsa görür.
create policy "müşteri notu: sahibi yönetir" on public.customer_notes
  for all using (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'))
  with check (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'));

alter table public.favorites enable row level security;

create policy "favori: kendi listesini yönetir" on public.favorites
  for all using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

alter table public.session_packages enable row level security;

-- Seans paketi müşteri defterinin parçasıdır.
create policy "seans paketi: sahibi yönetir" on public.session_packages
  for all using (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'))
  with check (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'));

-- Gecikme haberleri yalnızca report_* ve claim_delay_notices ile okunur/yazılır; istemciye politika yok.
alter table public.delay_notices enable row level security;

-- Kupon: yalnızca kupon fonksiyonları yazar. Müşteri etkin, tarih aralığındaki kuponları (işletme yayında ve paketinde
-- kupon varken) okur; sahibi hepsini. Kod satırını müşteri kendininkini, sahibi işletmesininkini okur. Deneme kaydı kapalı.
alter table public.coupons enable row level security;
alter table public.coupon_claims enable row level security;
alter table public.coupon_code_attempts enable row level security;

create policy "kupon: herkes okur" on public.coupons
  for select using (
    is_active
    and public.is_bookable(business_id)
    and public.plan_has_feature(business_id, 'coupons')
    and (select (now() at time zone b.timezone)::date from public.businesses b where b.id = business_id)
        between starts_on and ends_on
  );
create policy "kupon: sahibi okur" on public.coupons
  for select using (public.is_business_owner(business_id));
create policy "kupon kodu: müşteri okur" on public.coupon_claims
  for select using (customer_id = (select auth.uid()));
create policy "kupon kodu: sahibi okur" on public.coupon_claims
  for select using (public.is_business_owner(business_id));

-- Menü: herkes yayındaki işletmenin aktif ürünlerini okur; sahibi hepsini okur ve (paketinde 'menu' varsa) yazar.
alter table public.menu_items enable row level security;
create policy "menü: herkes aktifi okur" on public.menu_items
  for select using (is_active and public.is_bookable(business_id));
create policy "menü: sahibi okur" on public.menu_items
  for select using (public.is_business_owner(business_id));
create policy "menü: sahibi yazar" on public.menu_items
  for all using (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'menu'))
  with check (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'menu'));

alter table public.waitlist enable row level security;

-- Müşteri listeye join_waitlist ile yazılır; kendi kayıtlarını görür ve siler.
create policy "bekleme: kendininkini okur" on public.waitlist
  for select using (customer_id = (select auth.uid()));
create policy "bekleme: kendininkini siler" on public.waitlist
  for delete using (customer_id = (select auth.uid()));

-- profiles
create policy "profil: kendini okur" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profil: kendini günceller" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- businesses
create policy "işletme: yayındakileri herkes okur" on public.businesses
  for select using (
    (approval_status = 'approved' and is_published and not is_suspended and subscription_ends_at > now())
    or owner_id = (select auth.uid())
  );
create policy "işletme: sahibi oluşturur" on public.businesses
  for insert with check (owner_id = (select auth.uid()));
create policy "işletme: sahibi günceller" on public.businesses
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Askı geçmişi ve dondurma talepleri: sahibi kendininkini, yönetici hepsini okur; yazma admin_*/request_freeze ile.
alter table public.business_suspensions enable row level security;
alter table public.freeze_requests      enable row level security;
create policy "askı: sahibi okur" on public.business_suspensions
  for select using (public.is_business_owner(business_id));
create policy "admin: askıları okur" on public.business_suspensions
  for select using ((select public.is_admin()));
create policy "dondurma talebi: sahibi okur" on public.freeze_requests
  for select using (public.is_business_owner(business_id));
create policy "admin: dondurma taleplerini okur" on public.freeze_requests
  for select using ((select public.is_admin()));

-- Destek: herkes kendi talebini, yönetici hepsini okur; yazma open_support_ticket/reply_support_ticket/admin_* ile.
alter table public.support_tickets  enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_emails   enable row level security;
create policy "destek: sahibi okur" on public.support_tickets
  for select using (user_id = (select auth.uid()));
create policy "admin: destek taleplerini okur" on public.support_tickets
  for select using ((select public.is_admin()));
create policy "destek mesajı: talep sahibi okur" on public.support_messages
  for select using (exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
create policy "admin: destek mesajlarını okur" on public.support_messages
  for select using ((select public.is_admin()));

-- services
create policy "hizmet: herkes okur" on public.services
  for select using (is_active and public.is_bookable(business_id));
create policy "hizmet: sahibi yönetir" on public.services
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- staff
create policy "personel: herkes okur" on public.staff
  for select using (is_active and public.is_bookable(business_id));
create policy "personel: sahibi yönetir" on public.staff
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- staff_services
create policy "personel hizmeti: herkes okur" on public.staff_services
  for select using (
    exists (
      select 1 from public.staff s
      where s.id = staff_id and (public.is_bookable(s.business_id) or public.is_business_owner(s.business_id))
    )
  );
create policy "personel hizmeti: sahibi yönetir" on public.staff_services
  for all using (
    exists (select 1 from public.staff s where s.id = staff_id and public.is_business_owner(s.business_id))
  )
  with check (
    exists (
      select 1 from public.staff s join public.services sv on sv.business_id = s.business_id
      where s.id = staff_id and sv.id = service_id and public.is_business_owner(s.business_id)
    )
  );

-- reviews (müşteri add_review ile ekler)
create policy "değerlendirme: herkes okur" on public.reviews
  for select using (true);

-- plans / payments
create policy "paket: herkes okur" on public.plans
  for select using (true);
create policy "ödeme: işletme kendi ödemelerini okur" on public.payments
  for select using (public.is_business_owner(business_id));

-- working_hours
create policy "çalışma saati: herkes okur" on public.working_hours
  for select using (public.is_bookable(business_id));
create policy "çalışma saati: sahibi yönetir" on public.working_hours
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- time_off
create policy "izin: sahibi yönetir" on public.time_off
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- appointments (müşteri randevuyu book_appointment ile alır)
create policy "randevu: müşteri ve işletme okur" on public.appointments
  for select using (customer_id = (select auth.uid()) or public.is_business_owner(business_id));
create policy "randevu: işletme manuel ekler" on public.appointments
  for insert with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.businesses b
                where b.id = business_id and b.subscription_ends_at > now() and b.business_type = 'appointment')
  );
create policy "randevu: işletme günceller" on public.appointments
  for update using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- Yönetici her şeyi okur; değişiklikleri admin_* fonksiyonlarıyla yapar (paketler hariç).
create policy "admin: profilleri okur" on public.profiles for select using ((select public.is_admin()));
create policy "admin: işletmeleri okur" on public.businesses for select using ((select public.is_admin()));
-- Ad, adres, görseller vb.; abonelik, puan ve onay alanları protect_business_columns ile korunur.
create policy "admin: işletmeleri günceller" on public.businesses
  for update using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin: hizmetleri okur" on public.services for select using ((select public.is_admin()));
create policy "admin: personeli okur" on public.staff for select using ((select public.is_admin()));
create policy "admin: randevuları okur" on public.appointments for select using ((select public.is_admin()));
create policy "admin: ödemeleri okur" on public.payments for select using ((select public.is_admin()));
create policy "admin: bildirimleri okur" on public.notifications for select using ((select public.is_admin()));
create policy "admin: paket ekler" on public.plans for insert with check ((select public.is_admin()));
create policy "admin: paket günceller" on public.plans
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

-- Hata kayıtları: log_error yazar; yönetici okur, çözüldü işaretler ve siler.
alter table public.error_logs enable row level security;
create policy "hata: yönetici okur" on public.error_logs for select using ((select public.is_admin()));
create policy "hata: yönetici günceller" on public.error_logs
  for update using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "hata: yönetici siler" on public.error_logs for delete using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 5) Canlı güncelleme (panelde yeni randevular ve bildirimler anında görünür)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.inbox;
  end if;
end $$;
