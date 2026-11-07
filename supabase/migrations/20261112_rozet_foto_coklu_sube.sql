-- =====================================================================
-- Yeni özellikler:
-- - "Mahallenin gözdesi" aylık rozeti (businesses.badge_month, badge_runs, award_monthly_badges).
-- - Fotoğraflı yorum: onay bekleyen fotoğraf review_photos'ta, onaylanan reviews.photo_url'de.
-- - Çoklu hizmet ve grup randevusu: appointments.extra_service_ids, party_size; booking_minutes.
--   get_available_slots ve book_appointment yeni isteğe bağlı parametre aldı (eski uygulama sürümleri çalışır).
-- - Çoklu şube: owner_id tekil değil; profiles.active_business_id, my_business_id, set_active_business,
--   enforce_branch_rules (ücretli Pro, en fazla 5); şubeye deneme verilmez.
-- 20261111_kotuye_kullanim.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Tablolar ve sütunlar
alter table public.businesses add column if not exists badge_month date;
alter table public.businesses drop constraint if exists businesses_owner_id_key;
create index if not exists businesses_owner_idx on public.businesses (owner_id);
alter table public.profiles add column if not exists active_business_id uuid references public.businesses (id) on delete set null;
alter table public.reviews add column if not exists photo_url text check (length(photo_url) <= 300);
alter table public.appointments
  add column if not exists extra_service_ids uuid[] not null default '{}' check (cardinality(extra_service_ids) <= 3),
  add column if not exists party_size smallint not null default 1 check (party_size between 1 and 4);

create table if not exists public.badge_runs (
  month   date primary key,
  ran_at  timestamptz not null default now(),
  winners int not null default 0
);
alter table public.badge_runs enable row level security;

create table if not exists public.review_photos (
  review_id   uuid primary key references public.reviews (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  url         text not null check (length(url) <= 300),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);
create index if not exists review_photos_pending_idx on public.review_photos (created_at) where status = 'pending';
alter table public.review_photos enable row level security;
drop policy if exists "yorum fotoğrafı: müşteri kendininkini okur" on public.review_photos;
create policy "yorum fotoğrafı: müşteri kendininkini okur" on public.review_photos
  for select using (customer_id = (select auth.uid()));
drop policy if exists "admin: yorum fotoğraflarını okur" on public.review_photos;
create policy "admin: yorum fotoğraflarını okur" on public.review_photos
  for select using ((select public.is_admin()));

-- İmzası değişen fonksiyonlar: eski sürüm kaldırılır (yeni parametreler isteğe bağlı, eski çağrılar çalışır).
drop function if exists public.get_available_slots(uuid, uuid, date, uuid, uuid);
drop function if exists public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid);

-- Randevunun toplam süresi (dakika): ana hizmet + ek hizmetler (en fazla 3, tekrarsız, ana hizmet dışında), kişi
-- sayısıyla çarpılır (1-4). Hizmetlerden biri işletmenin etkin hizmeti değilse ya da kural bozuksa boş döner.
create or replace function public.booking_minutes(p_business_id uuid, p_service_id uuid, p_extra uuid[] default '{}', p_party int default 1)
returns int
language plpgsql stable set search_path = ''
as $$
declare
  v_extra uuid[] := coalesce(p_extra, '{}');
  v_sum   int;
  v_n     int;
begin
  if coalesce(p_party, 1) not between 1 and 4 or cardinality(v_extra) > 3 or p_service_id = any (v_extra)
     or cardinality(v_extra) <> (select count(distinct x) from unnest(v_extra) x) then
    return null;
  end if;
  select sum(sv.duration_minutes), count(*) into v_sum, v_n
  from public.services sv
  where sv.business_id = p_business_id and sv.is_active and (sv.id = p_service_id or sv.id = any (v_extra));
  if v_n <> 1 + cardinality(v_extra) then return null; end if;
  return v_sum * coalesce(p_party, 1);
end;
$$;

-- Belirli bir gün için boş saatler. p_staff_id boşsa tüm personel.
-- p_ignore: ertelenen randevu; müşterisi veya işletmesi soruyorsa o randevunun saati boş sayılır.
-- p_extra_service_ids / p_party_size: ek hizmetler ve kişi sayısı (booking_minutes); personel hepsini yapabilmeli.
create or replace function public.get_available_slots(
  p_business_id uuid,
  p_service_id  uuid,
  p_day         date,
  p_staff_id    uuid default null,
  p_ignore      uuid default null,
  p_extra_service_ids uuid[] default '{}',
  p_party_size  int default 1
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

  v_duration := make_interval(mins => public.booking_minutes(p_business_id, p_service_id, p_extra_service_ids, p_party_size));
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
      or not exists (
        select 1 from unnest(array[p_service_id] || coalesce(p_extra_service_ids, '{}')) sv(id)
        where not exists (select 1 from public.staff_services ss where ss.staff_id = st.id and ss.service_id = sv.id)
      )
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

-- Girişli müşteri randevu alır. p_staff_id boşsa uygun ilk personel.
-- Sahte randevuya karşı: işletmenin engellediği müşteri alamaz; aynı işletmede en fazla 3, toplamda
-- en fazla 10 yaklaşan randevu; 24 saatte en fazla 10 randevu.
-- Dönen: {id, status, price}. İşletme elle onaylıyorsa, yalnızca tanıdık müşteriyi otomatik onaylıyorsa ve müşteri ilk kez
-- geliyorsa ya da müşteri sık iptal ediyorsa randevu işletme onayına düşer (status = pending).
create or replace function public.book_appointment(
  p_business_id    uuid,
  p_service_id     uuid,
  p_staff_id       uuid,
  p_starts_at      timestamptz,
  p_customer_name  text,
  p_customer_phone text,
  p_note           text default '',
  p_customer_email text default null,
  p_coupon_id      uuid default null,
  p_extra_service_ids uuid[] default '{}',
  p_party_size     int default 1
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
  v_mins   int;
  v_total  numeric(10, 2);
  v_names  text;
  v_extra  uuid[] := coalesce(p_extra_service_ids, '{}');
  v_party  int := coalesce(p_party_size, 1);
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
  if v_party not between 1 and 4 then raise exception 'Bir randevuda en fazla 4 kişi olabilir.'; end if;
  v_mins := public.booking_minutes(b.id, s.id, v_extra, v_party);
  if v_mins is null then raise exception 'Seçtiğiniz hizmetler birlikte alınamıyor; en fazla 3 ek hizmet seçin.'; end if;
  -- Fiyat ve ad: hizmetlerin toplamı, kişi sayısıyla.
  select (s.price + coalesce(sum(x.price), 0)) * v_party,
         left(concat_ws(' + ', s.name, string_agg(x.name, ' + ' order by array_position(v_extra, x.id)))
              || case when v_party > 1 then ' · ' || v_party || ' kişi' else '' end, 200)
  into v_total, v_names
  from public.services x
  where x.id = any (v_extra) and x.business_id = b.id;

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
    p_business_id, p_service_id, (p_starts_at at time zone b.timezone)::date, p_staff_id, null, v_extra, v_party
  ) x
  where x.slot_start = p_starts_at
  limit 1;

  if v_staff is null then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
  end if;

  v_price := v_total;
  if p_coupon_id is not null then
    -- Henüz alınmamış kupon randevuyla birlikte alınır (sınır ve durdurma kuralları claim_coupon'da).
    if cl.id is null then cl := public.claim_coupon(c.id); end if;
    -- İndirim yalnızca bir kişinin ana hizmetine uygulanır; ek hizmet ve diğer kişiler liste fiyatından.
    v_price := v_total - s.price + public.coupon_price(s.price, c.discount_type, c.discount_value);
  end if;

  insert into public.appointments (
    business_id, service_id, staff_id, customer_id, service_name,
    customer_name, customer_phone, customer_email, note, price, list_price, coupon_claim_id, starts_at, ends_at, status,
    extra_service_ids, party_size
  ) values (
    b.id, s.id, v_staff, v_uid, v_names,
    trim(p_customer_name), v_phone, v_email, left(coalesce(p_note, ''), 500), v_price,
    case when p_coupon_id is not null then v_total end, cl.id,
    p_starts_at, p_starts_at + make_interval(mins => v_mins),
    case when public.needs_confirmation(b, v_uid) then 'pending' else 'confirmed' end,
    v_extra, v_party
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

-- Gelecekteki randevunun saatini değiştirir: müşterisi (girişli) veya işletme sahibi.
-- Yeni saat boş saatlerden olmalı. p_staff_id boşsa uygun ilk personel.
-- Müşteri değiştirdiyse ve randevusu onaya düşecek bir müşteriyse (needs_confirmation) randevu yeniden onay bekler.
create or replace function public.reschedule_appointment(p_id uuid, p_starts_at timestamptz, p_staff_id uuid default null)
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
  if not v_owner and a.reschedule_count >= 3 then
    raise exception 'Bu randevunun saatini en fazla 3 kez değiştirebilirsiniz. Yeni saat için işletmeyi arayın ya da randevuyu iptal edin.';
  end if;

  v_mins := public.booking_minutes(a.business_id, a.service_id, a.extra_service_ids, a.party_size);
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
    a.business_id, a.service_id, (p_starts_at at time zone b.timezone)::date, p_staff_id, a.id, a.extra_service_ids, a.party_size
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
      status = case when not v_owner and public.needs_confirmation(b, a.customer_id) then 'pending' else a.status end,
      reschedule_count = a.reschedule_count + case when v_owner then 0 else 1 end
  where id = a.id;
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

-- İşletme sahibi randevuyu doğrudan (RLS ile) yazarken: elle eklenen randevu bir müşteri hesabına veya e-postaya
-- bağlanamaz (başkasına bildirim, e-posta gönderilemez); hesap, e-posta, işletme ve paket sonradan değiştirilemez;
-- hesapla alınan randevunun telefonu da değiştirilemez (telefon değiştirilip "gelmedi" denerek başkası engellenemez),
-- saati gelmeden "gelmedi" işaretlenemez;
-- personel ve hizmet aynı işletmenin olmalı (başka işletmenin saatleri doldurulamaz).
-- Fonksiyonlardan (book_appointment vb.) gelen yazmalar etkilenmez: onlar fonksiyon sahibi olarak çalışır.
create or replace function public.protect_appointment_columns()
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
      new.reschedule_count := 0;
      new.former_email_hash := null;
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
      new.reschedule_count := old.reschedule_count;
      new.extra_service_ids := old.extra_service_ids;
      new.party_size := old.party_size;
      new.former_email_hash := old.former_email_hash;
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

-- ---------------------------------------------------------------------
-- 2) Yardımcı fonksiyonlar ve tetikleyiciler
-- ---------------------------------------------------------------------
-- Oturumdaki hesabın çalıştığı işletme: seçili şube (profiles.active_business_id) hâlâ onunsa o, değilse ilk açtığı işletme.
-- "Benim işletmem" diyen fonksiyonlar (ödeme, davet, dondurma, kupon, destek) bunu kullanır.
create or replace function public.my_business_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select b.id from public.profiles p join public.businesses b on b.id = p.active_business_id and b.owner_id = p.id
     where p.id = auth.uid()),
    (select b.id from public.businesses b where b.owner_id = auth.uid() order by b.created_at, b.id limit 1)
  );
$$;

-- İkinci ve sonraki işletme (şube): hesapta ücretli (deneme değil) Pro aboneliği olan onaylı bir işletme olmalı;
-- en fazla 5 işletme. Şubeye ücretsiz deneme verilmez (admin_review_business).
-- Çağıranın yetkisiyle çalışır (security definer içinde current_user her zaman sahip olurdu); sahip kendi işletmelerini okur.
create or replace function public.enforce_branch_rules()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_n int;
begin
  -- Başkası adına açma girişimini satır güvenliği reddeder.
  if current_user not in ('anon', 'authenticated') or new.owner_id is distinct from auth.uid() then return new; end if;
  select count(*) into v_n from public.businesses where owner_id = new.owner_id;
  if v_n = 0 then return new; end if;
  if v_n >= 5 then raise exception 'Bir hesapla en fazla 5 şube açılabilir.'; end if;
  if not exists (
    select 1 from public.businesses b
    where b.owner_id = new.owner_id and b.approval_status = 'approved' and b.plan_id = 'pro'
      and b.subscription_ends_at > now() and b.subscription_ends_at is distinct from b.trial_ends_at
  ) then
    raise exception 'Şube eklemek için ücretli Pro paketiniz olmalı.';
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_branch_rules on public.businesses;
create trigger businesses_branch_rules
  before insert on public.businesses
  for each row execute function public.enforce_branch_rules();

-- Panelde şube değiştirir.
create or replace function public.set_active_business(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_business_owner(p_id) then raise exception 'Şube bulunamadı.'; end if;
  update public.profiles set active_business_id = p_id where id = auth.uid();
end;
$$;

-- Kullanıcı profilinin kimliğini ve kayıt tarihini değiştiremez: kayıt tarihi işletmeye müşteri kartında
-- "üyelik tarihi" olarak gösterilir (customer_card); geriye alınarak eski üye gibi görünülmesin.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.created_at := old.created_at;
    new.active_business_id := old.active_business_id;
  end if;
  return new;
end;
$$;

-- İşletme sahibi puan, abonelik, askı ve onay alanlarını elle değiştiremez;
-- bunları sadece refresh_business_rating, apply_subscription ve admin_* fonksiyonları yazar.
-- Tek istisna: reddedilen başvuru yeniden gönderilebilir (approval_status 'rejected' -> 'pending').
-- Yönetici de işletmeyi doğrudan (RLS ile) aynı kurallarla düzenler; işletmenin sahibini değiştiremez.
-- İşletme türü eklemede seçilir, sonradan yalnızca admin_set_business_type değiştirir.
-- Kayıt tarihi de elle yazılamaz (yönetimdeki kayıt tarihi ve dönem istatistikleri buna dayanır).
-- Saat dilimi geçerli olmalı: geçersiz değer tüm işletmelerin ortak işlerini (hatırlatma, bekleme listesi) bozar.
create or replace function public.protect_business_columns()
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
      new.badge_month := null;
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
      new.badge_month := old.badge_month;
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

-- Yeni işletmeye varsayılan çalışma saatleri ve (vitrin değilse) bir personel ekle. Ücretsiz deneme onayla başlar (admin_review_business).
create or replace function public.business_after_insert()
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

  -- Yeni açılan işletme (şube) panelde seçili olur.
  update public.profiles set role = 'business', active_business_id = new.id where id = new.owner_id;
  return new;
end;
$$;

-- İşletme başvurusunu onaylar ya da reddeder (ret sebebi zorunlu, işletme sahibine gösterilir).
-- Onayda işletmenin hiç aboneliği olmadıysa 2 ay ücretsiz deneme başlar: randevulu işletmeye Pro paketin tüm özellikleri,
-- vitrin işletmesine Vitrin paketi.
create or replace function public.admin_review_business(p_business_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_status text;
  v_trial  boolean;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select approval_status into v_status from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if v_status = 'approved' then raise exception 'İşletme zaten onaylı.'; end if;
  -- Ücretsiz deneme yalnızca hesabın ilk işletmesine; şube onaylanınca paket alınması gerekir.
  select not exists (
    select 1 from public.businesses o join public.businesses b on b.id = p_business_id
    where o.owner_id = b.owner_id and o.id <> b.id and (o.created_at, o.id) < (b.created_at, b.id)
  ) into v_trial;

  if p_approve then
    update public.businesses
    set approval_status = 'approved', approval_note = '', reviewed_at = now(), reviewed_by = auth.uid(),
        plan_id = case when subscription_ends_at is null and v_trial
                       then (case when business_type = 'showcase' then 'vitrin' else 'pro' end) else plan_id end,
        trial_ends_at = case when subscription_ends_at is null and v_trial then now() + interval '2 months' else trial_ends_at end,
        subscription_ends_at = case when v_trial then coalesce(subscription_ends_at, now() + interval '2 months') else subscription_ends_at end
    where id = p_business_id;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Ret sebebini yazın.'; end if;
    update public.businesses
    set approval_status = 'rejected', approval_note = left(trim(p_note), 500), reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_business_id;
  end if;
end;
$$;

-- İşletme sahibi ödeme başlatır; tutar paketten alınır (istemciden değil). p_months: 1 (aylık) veya
-- 12 (yıllık: 10 ay fiyatına, 2 ay bedava).
create or replace function public.create_payment(p_plan_id text, p_months int default 1)
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
  select id, approval_status, business_type into v_business, v_status, v_type from public.businesses where id = public.my_business_id();
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

-- Yeni işletme kendisini davet eden işletmenin kodunu girer: bir kez ve ilk ödemeden önce.
-- Dönen: davet eden işletmenin adı.
create or replace function public.apply_referral(p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b   public.businesses;
  ref public.businesses;
begin
  select * into b from public.businesses where id = public.my_business_id() for update;
  if not found then raise exception 'Önce işletmenizi oluşturun.'; end if;
  if b.referred_by is not null then raise exception 'Davet kodu zaten girilmiş.'; end if;
  if exists (select 1 from public.payments p where p.business_id = b.id and p.status = 'paid') then
    raise exception 'Davet kodu ilk ödemeden önce girilebilir.';
  end if;
  select * into ref from public.businesses where referral_code = upper(trim(coalesce(p_code, '')));
  -- Kendi kodu ya da kendi başka şubesinin kodu geçmez.
  if not found or ref.id = b.id or ref.owner_id = b.owner_id then raise exception 'Davet kodu geçersiz.'; end if;

  update public.businesses set referred_by = ref.id where id = b.id;
  return ref.name;
end;
$$;

-- İşletmenin davet ettiği işletmeler: ad, katılma tarihi ve ödülün verildiği tarih (ilk ödemeleri).
create or replace function public.my_referrals()
returns table (name text, created_at timestamptz, rewarded_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.name, r.created_at, r.referral_rewarded_at
  from public.businesses r
  join public.businesses me on me.id = r.referred_by
  where me.id = public.my_business_id()
  order by r.created_at desc;
$$;

-- İşletme sahibi dondurma talebi açar; yönetici uygular ya da gerekçeyle reddeder. Açık talep tek olabilir.
create or replace function public.request_freeze(p_reason text, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b    public.businesses;
  v_id uuid;
begin
  select * into b from public.businesses where id = public.my_business_id();
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

-- Esnaf kupon açar (p_id boş) ya da düzenler. Kuponu Esnaf, Pro ve Vitrin paketleri açabilir. İlk alımdan sonra indirim, gün-saat
-- ve hizmetler değişmez; bitiş yalnızca uzatılır, sınır yalnızca yükseltilir (esnaf müşteriye söz vermiştir).
create or replace function public.save_coupon(
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
  select * into b from public.businesses where id = public.my_business_id();
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

  select * into c from public.coupons where id = p_id and business_id = b.id and not is_birthday for update;
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

create or replace function public.open_support_ticket(p_category text, p_subject text, p_body text)
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
  select * into b from public.businesses where id = public.my_business_id();
  insert into public.support_tickets (user_id, business_id, audience, category, subject)
  values (v_uid, b.id, case when b.approval_status = 'approved' then 'business' else 'customer' end, p_category, v_subject)
  returning id into v_id;
  perform public.support_add_message(v_id, false, p_body);
  return v_id;
end;
$$;

-- Kullanıcı listesi: hesap bilgileri (auth.users) + profil + işletme. p_id verilirse yalnızca o kullanıcı.
create or replace function public.admin_users(p_id uuid default null)
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
  -- Şubesi olan hesap tek satır: ilk açtığı işletme.
  left join lateral (select x.id, x.name, x.slug from public.businesses x where x.owner_id = u.id order by x.created_at, x.id limit 1) b on true
  where p_id is null or u.id = p_id
  order by u.created_at desc;
end;
$$;

-- Yönetim > Genel Bakış ve Analitik: seçilen dönemin (İstanbul günleri, en fazla 366 gün) ayrıntılı sayıları.
-- "kpi" altındaki her değer {cur: bu dönem, prev: hemen önceki eşit uzunluktaki dönem}. Anlık durum (MRR, aktif
-- abonelik, kuyruk) "snapshot" altında admin_stats'tan gelir. Günlük "mrr": ödemelerin kapsadığı günlere bölünmüş
-- aylık tutar (tahmini; erken yenilemede çakışan günler iki kez sayılır).
create or replace function public.admin_dashboard(p_from date, p_to date)
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
      left join lateral (select x.* from public.businesses x where x.owner_id = u.id order by x.created_at, x.id limit 1) b on true
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

-- Müşteri kendi yorumuna (randevu ya da kupon yorumu) sonuç fotoğrafı ekler; yorumdan sonraki 7 gün içinde, tek
-- fotoğraf. Adres yalnızca bu müşterinin /api/upload ile yüklediği dosya olabilir. Fotoğraf yönetici onayına düşer;
-- yeni fotoğraf eskisinin yerine geçer ve yeniden onay bekler.
create or replace function public.attach_review_photo(p_url text, p_appointment_id uuid default null, p_claim_id uuid default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r     public.reviews;
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  select * into r from public.reviews
  where customer_id = v_uid
    and ((p_appointment_id is not null and appointment_id = p_appointment_id)
         or (p_claim_id is not null and coupon_claim_id = p_claim_id));
  if not found then raise exception 'Değerlendirme bulunamadı.'; end if;
  if r.created_at < now() - interval '7 days' then
    raise exception 'Fotoğraf değerlendirmeden sonraki 7 gün içinde eklenebilir.';
  end if;
  if p_url is null or p_url !~ ('^https://cdn\.siftahgo\.app/reviews/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Geçersiz fotoğraf.';
  end if;
  insert into public.review_photos (review_id, customer_id, url)
  values (r.id, v_uid, p_url)
  on conflict (review_id) do update
  set url = excluded.url, status = 'pending', created_at = now(), reviewed_at = null, reviewed_by = null;
  update public.reviews set photo_url = null where id = r.id;
end;
$$;

-- Yönetici fotoğrafı onaylar (yorumda herkese görünür) ya da reddeder (görünmez).
create or replace function public.admin_moderate_review_photo(p_review_id uuid, p_approve boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  ph public.review_photos;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  update public.review_photos
  set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid()
  where review_id = p_review_id
  returning * into ph;
  if not found then raise exception 'Fotoğraf bulunamadı.'; end if;
  update public.reviews set photo_url = case when p_approve then ph.url end where id = p_review_id;
end;
$$;

-- Müşteri hesabını silmeye hazırlar (KVKK silme hakkı; asıl silme /api/account/delete ile auth.users'tan):
-- yaklaşan randevular iptal edilir (işletmeye haber gider), yorumlardaki ad kaldırılır. Randevu kayıtları
-- işletmenin defterinde hesapsız kalır. İşletme sahibinin hesabı burada silinmez.
create or replace function public.delete_my_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_hash text;
  v_old  text[];
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  if exists (select 1 from public.businesses b where b.owner_id = v_uid) then
    raise exception 'İşletme hesabı buradan silinemez. Lütfen destek adresimize yazın.';
  end if;
  -- 1 yıldan eski silinmiş hesap izleri kaldırılır.
  with d as (delete from public.deleted_accounts where deleted_at < now() - interval '1 year' returning email_hash)
  select array_agg(email_hash) into v_old from d;
  if v_old is not null then
    update public.coupon_claims set former_email_hash = null where former_email_hash = any (v_old);
    update public.appointments set former_email_hash = null where former_email_hash = any (v_old);
    delete from public.blocked_customers where former_email_hash = any (v_old) and customer_id is null and phone_key is null;
    update public.blocked_customers set former_email_hash = null where former_email_hash = any (v_old);
    update public.session_packages set former_email_hash = null where former_email_hash = any (v_old);
  end if;
  -- Aynı adresle açılacak hesap kupon haklarını, geçmişi, engelleri ve paketleri devralsın (reattach_deleted_account).
  select public.email_hash(u.email) into v_hash from auth.users u where u.id = v_uid;
  if v_hash is not null then
    insert into public.deleted_accounts (email_hash) values (v_hash)
    on conflict (email_hash) do update set deleted_at = now();
    update public.coupon_claims set former_email_hash = v_hash where customer_id = v_uid;
    update public.appointments set former_email_hash = v_hash where customer_id = v_uid;
    update public.blocked_customers set former_email_hash = v_hash where customer_id = v_uid;
    update public.session_packages set former_email_hash = v_hash where customer_id = v_uid;
  end if;
  update public.appointments set status = 'cancelled'
  where customer_id = v_uid and status in ('pending', 'confirmed') and starts_at > now();
  update public.reviews set customer_name = 'Eski üye', photo_url = null where customer_id = v_uid;
  -- Hesabın e-posta adresi işletmelerin defterinde ve gönderim kayıtlarında kalmaz.
  delete from public.notifications n using public.appointments a
  where a.id = n.appointment_id and a.customer_id = v_uid and n.recipient = 'customer';
  update public.appointments set customer_email = null where customer_id = v_uid;
end;
$$;

create or replace function public.award_monthly_badges()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_month date := (date_trunc('month', now() at time zone 'Europe/Istanbul') - interval '1 month')::date;
  v_n     int;
begin
  if exists (select 1 from public.badge_runs where month = v_month) then return 0; end if;
  with candidates as (
    select b.id, b.city, coalesce(b.district, '') district, b.category, b.rating_avg, b.rating_count,
           count(distinct a.customer_id) customers
    from public.businesses b
    join public.appointments a on a.business_id = b.id
    where b.business_type = 'appointment' and public.is_bookable(b.id)
      and b.rating_count >= 5 and b.rating_avg >= 4.5
      and a.customer_id is not null and a.customer_id <> b.owner_id
      and a.starts_at >= (v_month::timestamp at time zone b.timezone)
      and a.starts_at < ((v_month + interval '1 month')::timestamp at time zone b.timezone)
      and a.starts_at <= now()
      and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()))
    group by b.id
    having count(distinct a.customer_id) >= 10
  ),
  groups as (
    select b.city, coalesce(b.district, '') district, b.category
    from public.businesses b
    where b.business_type = 'appointment' and public.is_bookable(b.id)
    group by 1, 2, 3
    having count(*) >= 2
  ),
  winners as (
    select distinct on (c.city, c.district, c.category) c.id
    from candidates c
    join groups g on g.city = c.city and g.district = c.district and g.category = c.category
    order by c.city, c.district, c.category, c.customers desc, c.rating_avg desc, c.rating_count desc
  )
  update public.businesses b set badge_month = v_month from winners w where b.id = w.id;
  get diagnostics v_n = row_count;
  insert into public.badge_runs (month, winners) values (v_month, v_n);
  return v_n;
end;
$$;

revoke execute on function public.award_monthly_badges() from public, anon, authenticated;

commit;
