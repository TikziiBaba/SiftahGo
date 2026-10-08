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
  public.profiles
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
        'refresh_business_rating', 'get_customers', 'protect_business_rating'
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
  timezone           text not null default 'Europe/Istanbul',
  -- Değerlendirmelerden tetikleyiciyle hesaplanır.
  rating_avg         numeric(2, 1) not null default 0,
  rating_count       int not null default 0,
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
  where id = p_business_id and (is_published or owner_id = auth.uid());
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
  p_note           text default ''
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b       public.businesses;
  s       public.services;
  v_staff uuid;
  v_id    uuid;
begin
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Lütfen adınızı girin.';
  end if;
  if length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;

  select * into b from public.businesses where id = p_business_id and is_published;
  if not found then raise exception 'İşletme bulunamadı.'; end if;

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
    customer_name, customer_phone, note, price, starts_at, ends_at, status
  ) values (
    b.id, s.id, v_staff, auth.uid(), s.name,
    trim(p_customer_name), trim(p_customer_phone), left(coalesce(p_note, ''), 500), s.price,
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

-- İşletme sahibi puan alanlarını elle değiştiremez; sadece refresh_business_rating yazar.
create function public.protect_business_rating()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.rating_avg := 0;
      new.rating_count := 0;
    else
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
    end if;
  end if;
  return new;
end;
$$;

create trigger businesses_protect_rating
  before insert or update on public.businesses
  for each row execute function public.protect_business_rating();

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
alter table public.profiles      enable row level security;
alter table public.businesses    enable row level security;
alter table public.services      enable row level security;
alter table public.staff         enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off      enable row level security;
alter table public.appointments  enable row level security;
alter table public.staff_services enable row level security;
alter table public.reviews        enable row level security;

-- profiles
create policy "profil: kendini okur" on public.profiles
  for select using (id = auth.uid());
create policy "profil: kendini günceller" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- businesses
create policy "işletme: yayındakileri herkes okur" on public.businesses
  for select using (is_published or owner_id = auth.uid());
create policy "işletme: sahibi oluşturur" on public.businesses
  for insert with check (owner_id = auth.uid());
create policy "işletme: sahibi günceller" on public.businesses
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "işletme: sahibi siler" on public.businesses
  for delete using (owner_id = auth.uid());

-- services
create policy "hizmet: herkes okur" on public.services
  for select using (
    is_active and exists (
      select 1 from public.businesses b where b.id = business_id and b.is_published
    )
  );
create policy "hizmet: sahibi yönetir" on public.services
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- staff
create policy "personel: herkes okur" on public.staff
  for select using (
    is_active and exists (
      select 1 from public.businesses b where b.id = business_id and b.is_published
    )
  );
create policy "personel: sahibi yönetir" on public.staff
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- staff_services
create policy "personel hizmeti: herkes okur" on public.staff_services
  for select using (
    exists (
      select 1 from public.staff s join public.businesses b on b.id = s.business_id
      where s.id = staff_id and (b.is_published or b.owner_id = auth.uid())
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

-- working_hours
create policy "çalışma saati: herkes okur" on public.working_hours
  for select using (
    exists (select 1 from public.businesses b where b.id = business_id and b.is_published)
  );
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
  for insert with check (public.is_business_owner(business_id));
create policy "randevu: işletme günceller" on public.appointments
  for update using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- 5) Canlı güncelleme (panelde yeni randevular anında görünür)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
