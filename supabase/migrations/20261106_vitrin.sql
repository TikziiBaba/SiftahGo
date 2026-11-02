-- =====================================================================
-- Vitrin (2026-11-06): randevu almayan işletme türü (lokanta, market, mağaza ...)
-- - businesses.business_type: 'appointment' (varsayılan) ya da 'showcase'. Eklemede seçilir, sonradan yalnızca
--   yönetici değiştirir (admin_set_business_type; yaklaşan aktif randevusu olan işletme vitrine çevrilemez).
-- - Vitrin paketi: 149 ₺, 1 personel, kupon-duyuru-kısayol-menü; yalnızca vitrin işletmesi alabilir, vitrin işletmesi
--   başka paket alamaz (create_payment, admin_grant_subscription). Onayda vitrin işletmesi 2 ay Vitrin denemesi alır.
-- - Vitrin işletmesinin personeli olmaz; book_appointment, reschedule_appointment ve join_waitlist onu reddeder;
--   "Bugün müsait" listesinde çıkmaz. is_bookable değişmedi (kupon ve sayfa görünürlüğü ona dayanır).
-- 20261105_kupon.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

alter table public.businesses
  add column business_type text not null default 'appointment' check (business_type in ('appointment', 'showcase'));

-- 'vitrin': randevu almayan işletmelerin (business_type = 'showcase') tek paketi; randevulu işletmeler alamaz.
insert into public.plans (id, name, price, staff_limit, features, sort_order) values
  ('vitrin', 'Vitrin', 149, 1, '{coupons,announcement,links,menu}', 0);

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

  update public.profiles set role = 'business' where id = new.owner_id;
  return new;
end;
$$;

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

create or replace function public.activate_subscription(p_merchant_oid text, p_total_amount numeric)
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

create or replace function public.admin_grant_subscription(
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

create or replace function public.admin_review_business(p_business_id uuid, p_approve boolean, p_note text default '')
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

create or replace function public.book_appointment(
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

create or replace function public.join_waitlist(p_business_id uuid, p_day date)
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

create or replace function public.available_today(p_ids uuid[])
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

-- ---------------------------------------------------------------------
-- Menü ve kupon yorumları
-- - menu_items: 'menu' özelliği olan paket (Vitrin) yazar, en fazla 200 ürün; görsel işletmenin /menu/ klasöründen.
-- - Kupon yorumu: reviews.appointment_id boş olabilir, coupon_claim_id dolu (add_coupon_review; yalnızca vitrin,
--   kasada kullanılmış kupon, kupon başına bir kez). Yorumdan sonra kasada kullanım geri alınamaz.
-- - claim_coupon_review_requests ("Nasıldı?", kullanımdan 2 saat sonra) ve claim_coupon_review_notices
--   ("Yeni değerlendirme") /api/notifications tarafından çağrılır.
-- - Vitrin işletmesinin sahibi doğrudan randevu ekleyemez.
-- ---------------------------------------------------------------------
create or replace function public.is_upload_url(p_url text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(
    p_url ~ '^https://cdn\.siftahgo\.app/businesses/[0-9a-f-]{36}/(logo|cover|gallery|menu)/[A-Za-z0-9._-]+$',
    false
  );
$$;

alter table public.reviews
  alter column appointment_id drop not null,
  add column coupon_claim_id uuid unique references public.coupon_claims (id) on delete cascade,
  add column owner_notified_at timestamptz,
  add constraint reviews_check check (num_nonnulls(appointment_id, coupon_claim_id) = 1);
alter table public.coupon_claims add column review_requested_at timestamptz;

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

alter table public.menu_items enable row level security;
create policy "menü: herkes aktifi okur" on public.menu_items
  for select using (is_active and public.is_bookable(business_id));
create policy "menü: sahibi okur" on public.menu_items
  for select using (public.is_business_owner(business_id));
create policy "menü: sahibi yazar" on public.menu_items
  for all using (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'menu'))
  with check (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'menu'));

-- Kupon yorumunda randevu yok: esnafa inbox yerine claim_coupon_review_notices haber verir.
create or replace function public.review_after_insert()
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

create or replace function public.undo_coupon_redeem(p_claim_id uuid)
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

create or replace function public.find_coupon_code(p_business_id uuid, p_code text)
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
    'redeemed_at', cl.redeemed_at, 'customer_name', v_name, 'state', public.coupon_claim_state(cl), 'problem', public.coupon_redeem_problem(cl),
    'has_review', exists (select 1 from public.reviews r where r.coupon_claim_id = cl.id)
  );
end;
$$;

drop policy "randevu: işletme manuel ekler" on public.appointments;
create policy "randevu: işletme manuel ekler" on public.appointments
  for insert with check (
    public.is_business_owner(business_id)
    and exists (select 1 from public.businesses b
                where b.id = business_id and b.subscription_ends_at > now() and b.business_type = 'appointment')
  );

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

commit;

-- ---------------------------------------------------------------------
-- Vitrinde gece yarısını aşan çalışma saati (ör. 18:00-01:00); randevulu işletme sıkı kalır.
-- Dakikada bir çalışan haber sorguları için kısmi dizinler.
-- ---------------------------------------------------------------------
alter table public.working_hours drop constraint working_hours_check;
alter table public.working_hours add constraint working_hours_check check (close_time <> open_time);

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

create index reviews_coupon_notice_idx on public.reviews (created_at)
  where coupon_claim_id is not null and owner_notified_at is null;
create index coupon_claims_review_request_idx on public.coupon_claims (redeemed_at)
  where redeemed_at is not null and review_requested_at is null;
