-- =====================================================================
-- Kasa, personel primi, "zamanı geldi" hatırlatması ve doğum günü kuponu.
-- - Kasa: randevuya ödeme şekli (nakit, kart, havale) ve tutarı; panelde gün sonu ve ay toplamı.
-- - Prim: personelin prim oranı ayrı, yalnızca sahibin okuduğu tabloda (staff_commissions).
-- - "Zamanı geldi": son randevudan businesses.rebook_days gün sonra müşteriye "Yine randevu alalım mı?".
--   Mevcut randevulu işletmelere kategoriden varsayılan süre yazılır (berber 28, kuaför 42 gün...).
-- - Doğum günü kuponu: müşteri ay ve gününü girer; esnaf indirimi açarsa 3 gün önce kendine özel kupon üretilir.
-- 20261108_fatura_muhasebe.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

alter table public.profiles
  add column rebook_reminders boolean not null default true,
  add column birth_month smallint,
  add column birth_day smallint,
  add constraint profiles_birthday_check check (
    (birth_month is null) = (birth_day is null)
    and (birth_month is null or (birth_month between 1 and 12 and birth_day between 1 and
         case when birth_month = 2 then 29 when birth_month in (4, 6, 9, 11) then 30 else 31 end))
  );

alter table public.businesses
  add column rebook_days smallint check (rebook_days between 7 and 180),
  add column birthday_discount_type text check (birthday_discount_type in ('percent', 'fixed')),
  add column birthday_discount_value numeric(10, 2),
  add constraint businesses_birthday_check check (
    (birthday_discount_type is null) = (birthday_discount_value is null)
    and (birthday_discount_type is null or birthday_discount_value > 0)
    and (birthday_discount_type is distinct from 'percent' or birthday_discount_value between 1 and 90)
  );

alter table public.appointments
  add column payment_method text check (payment_method in ('cash', 'card', 'transfer')),
  add column paid_amount numeric(10, 2) check (paid_amount >= 0),
  add column paid_at timestamptz;

alter table public.coupons add column is_birthday boolean not null default false;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'reminder_soon', 'review', 'rebook'));
alter table public.inbox drop constraint inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'review', 'reviewed', 'rebook'));

-- Personelin prim oranı ayrı tabloda: personel satırı herkese açık, prim değil.
create table public.staff_commissions (
  staff_id    uuid primary key references public.staff (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  percent     numeric(5, 2) not null check (percent between 0 and 100)
);
alter table public.staff_commissions enable row level security;
create policy "prim: sahibi okur" on public.staff_commissions
  for select using ((select public.is_business_owner(business_id)));
create policy "prim: sahibi ekler" on public.staff_commissions
  for insert with check (
    (select public.is_business_owner(business_id))
    and exists (select 1 from public.staff s where s.id = staff_commissions.staff_id and s.business_id = staff_commissions.business_id)
  );
create policy "prim: sahibi günceller" on public.staff_commissions
  for update using ((select public.is_business_owner(business_id)))
  with check (
    (select public.is_business_owner(business_id))
    and exists (select 1 from public.staff s where s.id = staff_commissions.staff_id and s.business_id = staff_commissions.business_id)
  );
create policy "prim: sahibi siler" on public.staff_commissions
  for delete using ((select public.is_business_owner(business_id)));

-- Kasa: ödeme şekli girilince tutar (boşsa randevu fiyatı) ve an yazılır; şekil silinince ikisi de silinir.
-- İptal edilen ya da gelinmeyen randevunun ödemesi silinir.
create function public.appointments_payment()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'no_show') or new.payment_method is null then
    new.payment_method := null;
    new.paid_amount := null;
    new.paid_at := null;
    return new;
  end if;
  new.paid_amount := coalesce(new.paid_amount, new.price);
  if tg_op = 'INSERT' or old.payment_method is null then
    new.paid_at := now();
  else
    new.paid_at := old.paid_at;
  end if;
  return new;
end;
$$;

create trigger appointments_payment
  before insert or update of payment_method, paid_amount, status on public.appointments
  for each row execute function public.appointments_payment();

-- Yeni işletmenin "zamanı geldi" süresi kategorisinden gelir; diğer kategorilerde kapalı başlar, esnaf açabilir.
create function public.default_rebook_days(p_category text)
returns smallint
language sql immutable set search_path = ''
as $$
  select (case p_category
    when 'berber' then 28 when 'kuafor' then 42 when 'guzellik' then 30 when 'tirnak' then 21
    when 'spa' then 30 when 'oto-yikama' then 30 when 'veteriner' then 45
  end)::smallint;
$$;

create function public.businesses_rebook_default()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.rebook_days is null and new.business_type = 'appointment' then
    new.rebook_days := public.default_rebook_days(new.category);
  end if;
  return new;
end;
$$;

create trigger businesses_rebook_default
  before insert on public.businesses
  for each row execute function public.businesses_rebook_default();

-- "Zamanı geldi": müşterinin bir işletmedeki son randevusunun üzerinden işletmenin süresi (rebook_days) geçince
-- "Yine randevu alalım mı?" (uygulama içi + e-posta). Son randevu başına bir kez; 3 günden eski süreye gitmez.
-- Gitmez: işletmede yaklaşan randevusu ya da sonraki bir randevusu varsa, müşteri kapattıysa (rebook_reminders),
-- işletme engellediyse veya randevu alamıyorsa. İşletme saatiyle 10:00-20:00 arasında gönderilir. Eklenen sayı döner.
create function public.queue_rebook_reminders()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a   public.appointments;
  v_n int := 0;
  v_i int;
begin
  for a in
    select ap.* from public.appointments ap
    join public.businesses b on b.id = ap.business_id
    join public.profiles p on p.id = ap.customer_id
    where ap.status in ('confirmed', 'completed')
      and b.rebook_days is not null
      and ap.ends_at > now() - interval '1 year'
      and ap.ends_at + make_interval(days => b.rebook_days) <= now()
      and ap.ends_at + make_interval(days => b.rebook_days) > now() - interval '3 days'
      and extract(hour from now() at time zone b.timezone) between 10 and 19
      and p.rebook_reminders
      and public.is_bookable(b.id)
      and not exists (
        select 1 from public.appointments x
        where x.business_id = ap.business_id and x.customer_id = ap.customer_id and x.id <> ap.id
          and (x.starts_at > ap.starts_at and x.status <> 'cancelled'
               or x.status in ('pending', 'confirmed') and x.ends_at > now())
      )
      and not exists (
        select 1 from public.blocked_customers k
        where k.business_id = ap.business_id
          and (k.customer_id = ap.customer_id
               or k.phone_key = right(regexp_replace(ap.customer_phone, '\D', '', 'g'), 10))
      )
      and not exists (select 1 from public.inbox i where i.appointment_id = ap.id and i.kind = 'rebook')
  loop
    if a.customer_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (a.id, 'rebook', 'customer', a.customer_email)
      on conflict do nothing;
    end if;
    v_i := public.inbox_insert(a.customer_id, 'rebook', 'customer', a);
    v_n := v_n + v_i;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.queue_rebook_reminders() from public, anon, authenticated;

-- Doğum günü kuponu: esnafın açtığı indirimle (businesses.birthday_discount_*) müşteriye kendine özel, tek kişilik
-- bir kupon üretilir. Kupon durdurulmuş (is_active = false) açılır: herkese görünmez, başkası alamaz; kod müşterinin
-- "Kuponlarım"ında ve randevu kutusunda çalışır. Yıl başına işletme-müşteri çiftine bir kez (birthday_gifts).
create table public.birthday_gifts (
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  year        int not null,
  coupon_id   uuid references public.coupons (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (business_id, customer_id, year)
);
alter table public.birthday_gifts enable row level security;
create policy "doğum günü: sahibi okur" on public.birthday_gifts
  for select using ((select public.is_business_owner(business_id)));

-- p_today'den sonraki (ya da bugünkü) doğum günü. 29 Şubat artık olmayan yılda 28 Şubat sayılır.
create function public.next_birthday(p_month int, p_day int, p_today date)
returns date
language sql immutable set search_path = ''
as $$
  select case when d >= p_today then d
              else make_date(y + 1, p_month, least(p_day, extract(day from make_date(y + 1, p_month, 1) + interval '1 month - 1 day')::int))
         end
  from (select extract(year from p_today)::int y) yy,
       lateral (select make_date(y, p_month, least(p_day, extract(day from make_date(y, p_month, 1) + interval '1 month - 1 day')::int)) d) dd;
$$;

-- Sunucu dakikada bir çağırır: doğum gününe 3 gün kalan (ya da bugün doğum günü olan) müşterilere kuponu üretir ve
-- haber için döndürür. Müşteri bu işletmede son 2 yılda randevusu gerçekleşmiş ya da işletmeyi favorilemiş olmalı.
-- Kupon bugünden doğum gününden 7 gün sonrasına kadar geçerlidir. Bildirim tekrar denenmez; kupon "Kuponlarım"da kalır.
create function public.claim_birthday_gifts(p_limit int default 50)
returns table (
  id             uuid,
  email          text,
  customer_name  text,
  business_name  text,
  business_slug  text,
  discount_type  text,
  discount_value numeric,
  ends_on        date,
  tokens         text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r       record;
  v_cid   uuid;
  v_code  text;
  v_try   int;
  v_n     int := 0;
  v_title text;
begin
  for r in
    select b.id business_id, b.name, b.slug, b.birthday_discount_type, b.birthday_discount_value, p.id customer_id,
           p.full_name, t.today, public.next_birthday(p.birth_month, p.birth_day, t.today) bday
    from public.businesses b
    cross join lateral (select (now() at time zone b.timezone)::date today) t
    join public.profiles p on p.birth_month is not null
    where b.birthday_discount_type is not null
      and public.is_bookable(b.id)
      and public.plan_has_feature(b.id, 'coupons')
      and public.next_birthday(p.birth_month, p.birth_day, t.today) - t.today <= 3
      and (exists (select 1 from public.appointments a
                   where a.business_id = b.id and a.customer_id = p.id and a.starts_at > now() - interval '2 years'
                     and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now())))
           or exists (select 1 from public.favorites f where f.business_id = b.id and f.customer_id = p.id))
      and not exists (select 1 from public.blocked_customers k where k.business_id = b.id and k.customer_id = p.id)
      and not exists (
        select 1 from public.birthday_gifts g
        where g.business_id = b.id and g.customer_id = p.id
          and g.year = extract(year from public.next_birthday(p.birth_month, p.birth_day, t.today))::int
      )
    limit p_limit
  loop
    v_title := 'Doğum gününüz kutlu olsun';
    insert into public.coupons (business_id, title, discount_type, discount_value, starts_on, ends_on, total_limit,
                                is_active, is_birthday, claimed_count)
    values (r.business_id, v_title, r.birthday_discount_type, r.birthday_discount_value, r.today, r.bday + 7, 1,
            false, true, 1)
    returning coupons.id into v_cid;
    v_try := 0;
    loop
      v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.coupon_claims cl where cl.business_id = r.business_id and cl.code = v_code);
      v_try := v_try + 1;
      if v_try > 50 then raise exception 'Kod oluşturulamadı.'; end if;
    end loop;
    insert into public.coupon_claims (coupon_id, business_id, customer_id, code)
    values (v_cid, r.business_id, r.customer_id, v_code);
    insert into public.birthday_gifts (business_id, customer_id, year, coupon_id)
    values (r.business_id, r.customer_id, extract(year from r.bday)::int, v_cid);

    id := v_cid;
    select u.email::text into email from auth.users u where u.id = r.customer_id;
    customer_name := r.full_name;
    business_name := r.name;
    business_slug := r.slug;
    discount_type := r.birthday_discount_type;
    discount_value := r.birthday_discount_value;
    ends_on := r.bday + 7;
    tokens := coalesce((select array_agg(pt.token) from public.push_tokens pt where pt.user_id = r.customer_id), '{}');
    return next;
  end loop;
end;
$$;

revoke execute on function public.claim_birthday_gifts(int) from public, anon, authenticated;

-- Esnafın doğum günü kuponu özeti (yalnızca sahibi): bu yıl gönderilen ve kullanılan.
create function public.business_birthday_summary(p_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return (
    select jsonb_build_object(
      'sent', count(*),
      'used', count(*) filter (where cl.id is not null and public.coupon_claim_used(cl))
    )
    from public.birthday_gifts g
    left join public.coupon_claims cl on cl.coupon_id = g.coupon_id
    where g.business_id = p_business_id and g.year = extract(year from now() at time zone v_tz)::int
  );
end;
$$;

update public.businesses set rebook_days = public.default_rebook_days(category) where business_type = 'appointment';

create or replace function public.inbox_insert(p_user uuid, p_kind text, p_recipient text, a public.appointments)
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
    when p_kind = 'rebook' then 'Yine randevu alalım mı?'
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
    when p_kind = 'rebook' then concat_ws(' · ', v_business,
      format('Son %s ziyaretinizin üzerinden %s gün geçti', nullif(a.service_name, ''), (now()::date - a.starts_at::date)),
      'Randevu almak için dokunun')
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

create or replace function public.set_coupon_active(p_id uuid, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.coupons where id = p_id and not is_birthday;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  update public.coupons set is_active = coalesce(p_active, false) where id = p_id;
end;
$$;

create or replace function public.business_coupons(p_business_id uuid)
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
  where c.business_id = p_business_id and not c.is_birthday
  order by c.created_at desc;
end;
$$;

commit;
