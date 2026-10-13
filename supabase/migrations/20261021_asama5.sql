-- =====================================================================
-- Aşama 5 devamı: favori işletmeler, bekleme listesi, seans paketleri, Keşfet (bugün müsait, yakınımda),
-- davet kodu, yıllık ödeme.
-- 20261020_personel_saati_not_rapor.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Müşterinin favori işletmeleri.
create table public.favorites (
  customer_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, business_id)
);

-- Müşteriye satılan seans paketi (ör. 10 seans lazer); müşteri defterinde kalan seans görünür. Paketteki hizmetten
-- tamamlanan her randevu bir seans düşer (use_package_session). Müşteri telefonunun son 10 hanesine bağlı.
create table public.session_packages (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  phone_key     text not null check (phone_key ~ '^[0-9]{10}$'),
  customer_name text not null default '',
  service_id    uuid references public.services (id) on delete set null,
  name          text not null check (length(trim(name)) > 0),
  total         int not null check (total between 1 and 500),
  used          int not null default 0 check (used >= 0),
  created_at    timestamptz not null default now(),
  check (used <= total)
);
create index session_packages_customer_idx on public.session_packages (business_id, phone_key);

-- Seansı düşülen paket (use_package_session yazar).
alter table public.appointments
  add column package_id uuid references public.session_packages (id) on delete set null;

-- Tamamlanan randevu, müşterinin o hizmetteki en eski açık paketinden bir seans düşer; tamamlanma geri alınırsa
-- seans pakete iade edilir.
create function public.use_package_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pkg uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.service_id is not null then
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

alter table public.session_packages enable row level security;

-- Seans paketi müşteri defterinin parçasıdır.
create policy "seans paketi: sahibi yönetir" on public.session_packages
  for all using (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'))
  with check (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'));

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

alter table public.favorites enable row level security;

create policy "favori: kendi listesini yönetir" on public.favorites
  for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());

alter table public.waitlist enable row level security;

-- Müşteri listeye join_waitlist ile yazılır; kendi kayıtlarını görür ve siler.
create policy "bekleme: kendininkini okur" on public.waitlist
  for select using (customer_id = auth.uid());
create policy "bekleme: kendininkini siler" on public.waitlist
  for delete using (customer_id = auth.uid());

-- Girişli müşteri randevu alır. p_staff_id boşsa uygun ilk personel.
-- Sahte randevuya karşı: işletmenin engellediği müşteri alamaz; aynı işletmede en fazla 3, toplamda
-- en fazla 10 yaklaşan randevu; 24 saatte en fazla 10 randevu.
-- Dönen: {id, status}. Sık iptal eden müşterinin randevusu işletme onayına düşer (status = pending).
create or replace function public.book_appointment(
  p_business_id    uuid,
  p_service_id     uuid,
  p_staff_id       uuid,
  p_starts_at      timestamptz,
  p_customer_name  text,
  p_customer_phone text,
  p_note           text default '',
  p_customer_email text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b        public.businesses;
  s        public.services;
  v_uid    uuid := auth.uid();
  v_staff  uuid;
  v_id     uuid;
  v_status text;
  v_phone  text := trim(coalesce(p_customer_phone, ''));
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
begin
  if v_uid is null then
    raise exception 'Randevu almak için giriş yapın.';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Lütfen adınızı girin.';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Lütfen geçerli bir e-posta adresi girin.';
  end if;
  if v_email is null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;

  select * into b from public.businesses where id = p_business_id and public.is_bookable(id);
  if not found then raise exception 'Bu işletme şu an online randevu almıyor.'; end if;

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
    b.id, s.id, v_staff, v_uid, s.name,
    trim(p_customer_name), v_phone, v_email, left(coalesce(p_note, ''), 500), s.price,
    p_starts_at, p_starts_at + make_interval(mins => s.duration_minutes),
    case when b.auto_confirm then 'confirmed' else 'pending' end
  )
  returning id, status into v_id, v_status;

  -- O gün için bekleme listesindeyse artık haber gerekmez.
  delete from public.waitlist w
  where w.customer_id = v_uid and w.business_id = b.id and w.day = (p_starts_at at time zone b.timezone)::date;

  return jsonb_build_object('id', v_id, 'status', v_status);
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
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

-- Keşfet "Yakınımda" için işletmenin konumu (sahibi ayarlardan girer); ikisi birlikte dolu ya da boş.
alter table public.businesses
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add constraint businesses_location_check check ((latitude is null) = (longitude is null));

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

-- Davet ("esnaf esnafı getirsin"): her işletmenin kodu (mevcut işletmelere de üretilir); davetle gelen işletme
-- apply_referral ile girer. Ödül activate_subscription'da: davetle gelenin ilk ödemesinde ikisine de 1 ay.
alter table public.businesses
  add column referral_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column referred_by uuid references public.businesses (id) on delete set null,
  add column referral_rewarded_at timestamptz;

-- Ödeme dönemi: 1 ay (30 gün) veya 12 ay (365 gün, 10 ay fiyatına: 2 ay bedava).
alter table public.payments
  add column months int not null default 1 check (months in (1, 12));

create or replace function public.protect_business_columns()
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
      new.trial_ends_at := null;
      new.is_suspended := false;
      new.referral_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
      new.referred_by := null;
      new.referral_rewarded_at := null;
    else
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.plan_id := old.plan_id;
      new.subscription_ends_at := old.subscription_ends_at;
      new.trial_ends_at := old.trial_ends_at;
      new.is_suspended := old.is_suspended;
      new.referral_code := old.referral_code;
      new.referred_by := old.referred_by;
      new.referral_rewarded_at := old.referral_rewarded_at;
    end if;
  end if;
  return new;
end;
$$;

drop function public.create_payment(text);

-- İşletme sahibi ödeme başlatır; tutar paketten alınır (istemciden değil). p_months: 1 (aylık) veya
-- 12 (yıllık: 10 ay fiyatına, 2 ay bedava).
create function public.create_payment(p_plan_id text, p_months int default 1)
returns table (merchant_oid text, amount numeric, plan_name text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_plan public.plans;
  v_oid text;
  v_amount numeric;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Önce işletmenizi oluşturun.'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'Paket bulunamadı.'; end if;
  if p_months is null or p_months not in (1, 12) then raise exception 'Geçersiz ödeme dönemi.'; end if;

  v_amount := v_plan.price * case when p_months = 12 then 10 else 1 end;
  v_oid := 'SG' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || substr(md5(gen_random_uuid()::text), 1, 10);
  insert into public.payments (business_id, plan_id, merchant_oid, amount, months)
  values (v_business, v_plan.id, v_oid, v_amount, p_months);

  return query select v_oid, v_amount, v_plan.name;
end;
$$;

-- PayTR "başarılı" bildirimi: sadece sunucu (service_role) çağırır.
-- Aynı bildirim tekrar gelirse bir şey yapmaz. Yıllık ödeme 365, aylık 30 gün ekler.
-- Davetle gelen işletmenin ilk ödemesinde kendisine ve davet edene 1 ay (30 gün) hediye eklenir.
create or replace function public.activate_subscription(p_merchant_oid text, p_total_amount numeric)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pay public.payments;
  b   public.businesses;
  ref public.businesses;
begin
  select * into pay from public.payments where merchant_oid = p_merchant_oid for update;
  if not found then raise exception 'Ödeme bulunamadı: %', p_merchant_oid; end if;
  if pay.status <> 'pending' then return; end if;
  if p_total_amount < pay.amount then
    raise exception 'Ödenen tutar eksik: % < %', p_total_amount, pay.amount;
  end if;

  update public.payments set status = 'paid', paid_at = now() where id = pay.id;
  perform public.apply_subscription(pay.business_id, pay.plan_id, case when pay.months = 12 then 365 else 30 end);

  select * into b from public.businesses where id = pay.business_id for update;
  if b.referred_by is not null and b.referral_rewarded_at is null then
    update public.businesses set referral_rewarded_at = now() where id = b.id;
    select * into ref from public.businesses where id = b.referred_by;
    if found then
      perform public.apply_subscription(b.id, pay.plan_id, 30);
      perform public.apply_subscription(ref.id, coalesce(ref.plan_id, pay.plan_id), 30);
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

commit;
