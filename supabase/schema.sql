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
        'get_available_slots', 'book_appointment', 'cancel_appointment',
        'is_business_owner', 'business_after_insert', 'add_review',
        'refresh_business_rating', 'get_customers', 'protect_business_rating',
        'protect_business_columns', 'is_bookable', 'enforce_staff_limit', 'create_payment',
        'activate_subscription', 'fail_payment', 'plan_has_feature',
        'queue_appointment_notifications', 'queue_due_reminders', 'claim_notifications',
        'finish_notification', 'is_admin', 'apply_subscription', 'admin_stats', 'admin_users',
        'admin_grant_subscription', 'admin_end_subscription', 'admin_set_suspended'
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

-- ---------------------------------------------------------------------
-- 1) Tablolar
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
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
  features    text[] not null default '{}', -- 'customers', 'reports'
  sort_order  int not null default 0
);

insert into public.plans (id, name, price, staff_limit, features, sort_order) values
  ('baslangic', 'Başlangıç', 249, 1, '{}', 1),
  ('esnaf', 'Esnaf', 449, 5, '{customers,reports}', 2),
  ('pro', 'Pro', 749, null, '{customers,reports}', 3);

create table public.businesses (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null unique references public.profiles (id) on delete cascade,
  slug               text not null unique
                     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 50)
                     -- Web sitesindeki sayfa adlarıyla çakışmasın.
                     check (slug not in (
                       'panel', 'kesfet', 'giris', 'kayit', 'hesabim', 'api', 'auth', 'admin',
                       'sifremi-unuttum', 'sifre-yenile'
                     )),
  name               text not null check (length(trim(name)) > 0),
  category           text not null default 'diger',
  description        text not null default '',
  phone              text not null default '',
  city               text not null default '',
  district           text not null default '',
  address            text not null default '',
  logo_url           text,
  cover_url          text,
  gallery            text[] not null default '{}',
  slot_minutes       int not null default 30 check (slot_minutes between 5 and 240),
  booking_days       int not null default 30 check (booking_days between 1 and 365),
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 10080),
  auto_confirm       boolean not null default true,
  is_published       boolean not null default true,
  -- Yönetici yayından kaldırdıysa sahibi yeniden açamaz (admin_set_suspended).
  is_suspended       boolean not null default false,
  timezone           text not null default 'Europe/Istanbul',
  -- Değerlendirmelerden tetikleyiciyle hesaplanır.
  rating_avg         numeric(2, 1) not null default 0,
  rating_count       int not null default 0,
  -- Abonelik: sadece ödeme bildirimiyle (activate_subscription) değişir.
  plan_id              text references public.plans (id),
  subscription_ends_at timestamptz,
  created_at         timestamptz not null default now()
);
create index businesses_city_category_idx on public.businesses (city, category);

create table public.services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  description      text not null default '',
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
  name        text not null check (length(trim(name)) > 0),
  title       text not null default '',
  avatar_url  text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
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
  check (close_time > open_time)
);

-- İzin / tatil / kapalı saatler. staff_id boşsa tüm işletme kapalıdır.
create table public.time_off (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid references public.staff (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null default '',
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_business_idx on public.time_off (business_id, starts_at);

create table public.appointments (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  service_id     uuid references public.services (id) on delete set null,
  staff_id       uuid references public.staff (id) on delete set null,
  customer_id    uuid references public.profiles (id) on delete set null,
  service_name   text not null,
  customer_name  text not null,
  customer_phone text not null,
  -- Bildirim e-postaları için. Misafir isteğe bağlı yazar; girişli müşteride hesap e-postası.
  customer_email text check (customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note           text not null default '',
  price          numeric(10, 2) not null default 0,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Aynı personele aynı anda iki aktif randevu verilemez.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_business_time_idx on public.appointments (business_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id, starts_at);

-- Müşteri değerlendirmesi: tamamlanan her randevu için bir tane (add_review ile eklenir).
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  customer_id    uuid references public.profiles (id) on delete set null,
  customer_name  text not null,
  rating         smallint not null check (rating between 1 and 5),
  comment        text not null default '',
  created_at     timestamptz not null default now()
);
create index reviews_business_idx on public.reviews (business_id, created_at desc);

-- PayTR ödemeleri
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  plan_id      text not null references public.plans (id),
  merchant_oid text not null unique,
  amount       numeric(10, 2) not null,
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
  kind           text not null check (kind in ('booked', 'confirmed', 'cancelled', 'reminder')),
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

-- İşletme herkese açık mı: yayında, askıda değil ve aboneliği süren.
create function public.is_bookable(bid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = bid and is_published and not is_suspended and subscription_ends_at > now()
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
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'role' = 'business' then 'business' else 'customer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mevcut kullanıcılar için profil oluştur (eski şemadan kalanlar).
insert into public.profiles (id, full_name, phone, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  nullif(u.raw_user_meta_data ->> 'phone', ''),
  case when u.raw_user_meta_data ->> 'role' = 'business' then 'business' else 'customer' end
from auth.users u
on conflict (id) do nothing;

-- Yeni işletmeye varsayılan çalışma saatleri ve bir personel ekle.
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

  insert into public.staff (business_id, name)
  values (new.id, coalesce(v_owner_name, new.name));

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
create function public.get_available_slots(
  p_business_id uuid,
  p_service_id  uuid,
  p_day         date,
  p_staff_id    uuid default null
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

  return query
  select g.s, st.id
  from generate_series(
         (p_day + wh.open_time) at time zone b.timezone,
         ((p_day + wh.close_time) at time zone b.timezone) - v_duration,
         make_interval(mins => b.slot_minutes)
       ) as g(s)
  cross join public.staff st
  where st.business_id = p_business_id
    and st.is_active
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

-- Müşteri (girişli veya misafir) randevu alır. p_staff_id boşsa uygun ilk personel.
create function public.book_appointment(
  p_business_id    uuid,
  p_service_id     uuid,
  p_staff_id       uuid,
  p_starts_at      timestamptz,
  p_customer_name  text,
  p_customer_phone text,
  p_note           text default '',
  p_customer_email text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b       public.businesses;
  s       public.services;
  v_staff uuid;
  v_id    uuid;
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
begin
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Lütfen adınızı girin.';
  end if;
  if length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Lütfen geçerli bir e-posta adresi girin.';
  end if;
  if v_email is null then
    select u.email into v_email from auth.users u where u.id = auth.uid();
  end if;

  select * into b from public.businesses where id = p_business_id and public.is_bookable(id);
  if not found then raise exception 'Bu işletme şu an online randevu almıyor.'; end if;

  select * into s from public.services
  where id = p_service_id and business_id = p_business_id and is_active;
  if not found then raise exception 'Hizmet bulunamadı.'; end if;

  select x.staff_id into v_staff
  from public.get_available_slots(
    p_business_id, p_service_id, (p_starts_at at time zone b.timezone)::date, p_staff_id
  ) x
  where x.slot_start = p_starts_at
  limit 1;

  if v_staff is null then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
  end if;

  insert into public.appointments (
    business_id, service_id, staff_id, customer_id, service_name,
    customer_name, customer_phone, customer_email, note, price, starts_at, ends_at, status
  ) values (
    b.id, s.id, v_staff, auth.uid(), s.name,
    trim(p_customer_name), trim(p_customer_phone), v_email, left(coalesce(p_note, ''), 500), s.price,
    p_starts_at, p_starts_at + make_interval(mins => s.duration_minutes),
    case when b.auto_confirm then 'confirmed' else 'pending' end
  )
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
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

-- Müşteri tamamlanan randevusunu değerlendirir.
create function public.add_review(p_appointment_id uuid, p_rating int, p_comment text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_name text;
begin
  select * into a from public.appointments
  where id = p_appointment_id and customer_id = auth.uid() and status = 'completed';
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

-- İşletme sahibi puan, abonelik ve askı alanlarını elle değiştiremez;
-- bunları sadece refresh_business_rating, apply_subscription ve admin_* fonksiyonları yazar.
create function public.protect_business_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.rating_avg := 0;
      new.rating_count := 0;
      new.plan_id := null;
      new.subscription_ends_at := null;
      new.is_suspended := false;
    else
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.plan_id := old.plan_id;
      new.subscription_ends_at := old.subscription_ends_at;
      new.is_suspended := old.is_suspended;
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

-- İşletme sahibi ödeme başlatır; tutar paketten alınır (istemciden değil).
create function public.create_payment(p_plan_id text)
returns table (merchant_oid text, amount numeric, plan_name text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_plan public.plans;
  v_oid text;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Önce işletmenizi oluşturun.'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'Paket bulunamadı.'; end if;

  v_oid := 'SG' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || substr(md5(gen_random_uuid()::text), 1, 10);
  insert into public.payments (business_id, plan_id, merchant_oid, amount)
  values (v_business, v_plan.id, v_oid, v_plan.price);

  return query select v_oid, v_plan.price, v_plan.name;
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
-- Aynı bildirim tekrar gelirse bir şey yapmaz.
create function public.activate_subscription(p_merchant_oid text, p_total_amount numeric)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where merchant_oid = p_merchant_oid for update;
  if not found then raise exception 'Ödeme bulunamadı: %', p_merchant_oid; end if;
  if pay.status <> 'pending' then return; end if;
  if p_total_amount < pay.amount then
    raise exception 'Ödenen tutar eksik: % < %', p_total_amount, pay.amount;
  end if;

  update public.payments set status = 'paid', paid_at = now() where id = pay.id;
  perform public.apply_subscription(pay.business_id, pay.plan_id, 30);
end;
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
-- E-posta bildirimleri
-- ---------------------------------------------------------------------

-- Randevu alınınca, onaylanınca veya iptal edilince ilgili tarafa e-posta kuyruğa girer.
create function public.queue_appointment_notifications()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner_email text;
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
  elsif old.status = 'pending' and new.status = 'confirmed' then
    v_kind := 'confirmed';
    v_to := 'customer';
  elsif old.status in ('pending', 'confirmed') and new.status = 'cancelled' then
    v_kind := 'cancelled';
    -- İptal edene değil, karşı tarafa haber verilir.
    v_to := case when v_by_owner then 'customer' else 'business' end;
  else
    return null;
  end if;

  if v_to in ('customer', 'both') and new.customer_email is not null then
    insert into public.notifications (appointment_id, kind, recipient, email)
    values (new.id, v_kind, 'customer', new.customer_email)
    on conflict do nothing;
  end if;

  if v_to in ('business', 'both') then
    select u.email into v_owner_email
    from public.businesses b join auth.users u on u.id = b.owner_id
    where b.id = new.business_id;
    if v_owner_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (new.id, v_kind, 'business', v_owner_email)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;

create trigger appointments_queue_notifications
  after insert or update of status on public.appointments
  for each row execute function public.queue_appointment_notifications();

-- Zamanı gelen hatırlatmaları kuyruğa ekler; eklenen sayıyı döner.
-- Önceden alınan randevuya 24 saat kala, 24 saatten kısa süre kala alınana 2 saat kala
-- hatırlatılır. Başlamasına 3 saatten az kala alınan randevuya hatırlatma gitmez.
create function public.queue_due_reminders()
returns int
language sql volatile security definer set search_path = ''
as $$
  with ins as (
    insert into public.notifications (appointment_id, kind, recipient, email)
    select a.id, 'reminder', 'customer', a.customer_email
    from public.appointments a
    where a.status = 'confirmed'
      and a.customer_email is not null
      and a.starts_at > now()
      and a.created_at < a.starts_at - interval '3 hours'
      and a.starts_at <= now() + case
            when a.created_at <= a.starts_at - interval '24 hours' then interval '24 hours'
            else interval '2 hours'
          end
    on conflict do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;

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
  business_address text
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Artık anlamı kalmayanlar: başlamış randevu, iptal edilen randevunun onayı/hatırlatması.
  update public.notifications n
  set status = 'skipped'
  from public.appointments a
  where a.id = n.appointment_id
    and n.status = 'pending'
    and (a.starts_at <= now() or (n.kind <> 'cancelled' and a.status not in ('pending', 'confirmed')));

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
    concat_ws(', ', nullif(b.address, ''), nullif(b.district, ''), nullif(b.city, ''))
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

revoke execute on function public.queue_due_reminders() from public, anon, authenticated;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.finish_notification(uuid, text) from public, anon, authenticated;

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
end;
$$;

-- İşletmeyi askıya alır / askıdan çıkarır. Askıdaki işletme görünmez ve randevu almaz.
create function public.admin_set_suspended(p_business_id uuid, p_suspended boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  update public.businesses set is_suspended = p_suspended where id = p_business_id;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
end;
$$;

-- Kullanıcı listesi: hesap bilgileri (auth.users) + profil + işletme.
create function public.admin_users()
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
  order by u.created_at desc;
end;
$$;

-- Genel bakış sayıları ve son 30 günün günlük serisi (İstanbul günleri).
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
    'active', (select count(*) from public.businesses where subscription_ends_at > now()),
    'live', (select count(*) from public.businesses
             where subscription_ends_at > now() and is_published and not is_suspended),
    'suspended', (select count(*) from public.businesses where is_suspended),
    'expiring_7d', (select count(*) from public.businesses
                    where subscription_ends_at > now() and subscription_ends_at <= now() + interval '7 days'),
    'expired', (select count(*) from public.businesses where subscription_ends_at <= now()),
    'never_paid', (select count(*) from public.businesses where subscription_ends_at is null),
    'mrr', (select coalesce(sum(p.price), 0) from public.businesses b
            join public.plans p on p.id = b.plan_id where b.subscription_ends_at > now()),
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
                            where b.plan_id = p.id and b.subscription_ends_at > now())
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

-- ---------------------------------------------------------------------
-- 4) Satır düzeyi güvenlik (RLS)
-- ---------------------------------------------------------------------
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

-- profiles
create policy "profil: kendini okur" on public.profiles
  for select using (id = auth.uid());
create policy "profil: kendini günceller" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- businesses
create policy "işletme: yayındakileri herkes okur" on public.businesses
  for select using ((is_published and not is_suspended and subscription_ends_at > now()) or owner_id = auth.uid());
create policy "işletme: sahibi oluşturur" on public.businesses
  for insert with check (owner_id = auth.uid());
create policy "işletme: sahibi günceller" on public.businesses
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "işletme: sahibi siler" on public.businesses
  for delete using (owner_id = auth.uid());

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
  for select using (customer_id = auth.uid() or public.is_business_owner(business_id));
create policy "randevu: işletme manuel ekler" on public.appointments
  for insert with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.businesses b where b.id = business_id and b.subscription_ends_at > now())
  );
create policy "randevu: işletme günceller" on public.appointments
  for update using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- Yönetici her şeyi okur; değişiklikleri admin_* fonksiyonlarıyla yapar (paketler hariç).
create policy "admin: profilleri okur" on public.profiles for select using (public.is_admin());
create policy "admin: işletmeleri okur" on public.businesses for select using (public.is_admin());
create policy "admin: hizmetleri okur" on public.services for select using (public.is_admin());
create policy "admin: personeli okur" on public.staff for select using (public.is_admin());
create policy "admin: randevuları okur" on public.appointments for select using (public.is_admin());
create policy "admin: ödemeleri okur" on public.payments for select using (public.is_admin());
create policy "admin: bildirimleri okur" on public.notifications for select using (public.is_admin());
create policy "admin: paket ekler" on public.plans for insert with check (public.is_admin());
create policy "admin: paket günceller" on public.plans
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5) Canlı güncelleme (panelde yeni randevular anında görünür)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
