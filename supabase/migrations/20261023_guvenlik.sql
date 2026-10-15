-- =====================================================================
-- Güvenlik sertleştirmesi:
-- - İşletme elle randevu eklerken müşteri hesabı/e-postası bağlayamaz (başkasına bildirim/e-posta gönderemez),
--   başka işletmenin personeline randevu yazıp onun saatlerini dolduramaz.
-- - Elle eklenen randevular "sık iptal eden müşteri" işaretine yalnızca o işletmede sayılır.
-- - Geçersiz saat dilimi (tüm işletmelerin hatırlatmalarını bozardı) reddedilir.
-- - Metin alanlarına uzunluk, görsel adreslerine https sınırı.
-- - Ödeme denemesi sınırı (saatte 10); ücretli dönemde paket değişince kalan süre fiyata göre çevrilir.
-- 20261022_hata_kaydi.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Uzunluk ve adres sınırları. NOT VALID: mevcut kayıtlar denetlenmez, yeni yazılanlar denetlenir.
alter table public.profiles
  add constraint profiles_full_name_length check (length(full_name) <= 100) not valid,
  add constraint profiles_phone_length check (length(phone) <= 30) not valid;
alter table public.businesses
  add constraint businesses_name_length check (length(name) <= 100) not valid,
  add constraint businesses_category_length check (length(category) <= 40) not valid,
  add constraint businesses_description_length check (length(description) <= 2000) not valid,
  add constraint businesses_phone_length check (length(phone) <= 30) not valid,
  add constraint businesses_city_length check (length(city) <= 60) not valid,
  add constraint businesses_district_length check (length(district) <= 60) not valid,
  add constraint businesses_address_length check (length(address) <= 300) not valid,
  add constraint businesses_logo_url_check check (logo_url ~ '^https://\S+$' and length(logo_url) <= 500) not valid,
  add constraint businesses_cover_url_check check (cover_url ~ '^https://\S+$' and length(cover_url) <= 500) not valid,
  add constraint businesses_gallery_check check (cardinality(gallery) <= 12
    and (cardinality(gallery) = 0 or array_to_string(gallery, E'\n') ~ '^https://\S+(\nhttps://\S+)*$')) not valid;
alter table public.services
  add constraint services_name_length check (length(name) <= 120) not valid,
  add constraint services_description_length check (length(description) <= 1000) not valid;
alter table public.staff
  add constraint staff_name_length check (length(name) <= 80) not valid,
  add constraint staff_title_length check (length(title) <= 80) not valid,
  add constraint staff_avatar_url_check check (avatar_url ~ '^https://\S+$' and length(avatar_url) <= 500) not valid;
alter table public.time_off
  add constraint time_off_reason_length check (length(reason) <= 200) not valid;
alter table public.session_packages
  add constraint session_packages_customer_name_length check (length(customer_name) <= 100) not valid,
  add constraint session_packages_name_length check (length(name) <= 120) not valid;
alter table public.appointments
  add constraint appointments_service_name_length check (length(service_name) <= 200) not valid,
  add constraint appointments_customer_name_length check (length(customer_name) <= 100) not valid,
  add constraint appointments_customer_phone_length check (length(customer_phone) <= 30) not valid,
  add constraint appointments_customer_email_length check (length(customer_email) <= 254) not valid,
  add constraint appointments_note_length check (length(note) <= 1000) not valid;

-- Yeni kullanıcı kaydında profil oluştur.
create or replace function public.handle_new_user()
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

-- İşletme parametresi eklendi; eski imza kaldırılır.
drop function public.customer_history(uuid, text);

-- Müşterinin son 6 aydaki iptal (kendi iptal ettiği) ve gelmediği randevu sayısı; tüm işletmelerde.
-- Hesapla veya telefon numarasının son 10 hanesiyle eşleşir. İşletmenin elle eklediği randevular (hesapsız) yalnızca
-- o işletmede sayılır: elle randevuya her telefon yazılabilir; yoksa bir işletme başka birini tüm işletmelerde
-- "sık gelmeyen müşteri" gösterebilirdi.
create function public.customer_history(p_customer uuid, p_phone text, p_business uuid, out cancels int, out no_shows int)
language sql stable security definer set search_path = ''
as $$
  select
    (count(*) filter (where a.status = 'cancelled' and a.cancelled_by = 'customer'))::int,
    (count(*) filter (where a.status = 'no_show'))::int
  from public.appointments a
  where a.starts_at > now() - interval '180 days'
    and (a.customer_id is not null or a.business_id = p_business)
    and (
      (p_customer is not null and a.customer_id = p_customer)
      or (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
          and right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10))
    );
$$;

revoke execute on function public.customer_history(uuid, text, uuid) from public, anon, authenticated;

-- Randevu yazılırken: geçmiş sayıları ve "sık iptal eden müşteri" işareti (yalnız eklerken),
-- iptal edenin kim olduğu (durum iptale dönünce). İstemci bu alanları elle değiştiremez.
create or replace function public.appointments_before_write()
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
  end if;
  return new;
end;
$$;

-- İşletme sahibi randevuyu doğrudan (RLS ile) yazarken: elle eklenen randevu bir müşteri hesabına veya e-postaya
-- bağlanamaz (başkasına bildirim, e-posta gönderilemez); hesap, e-posta, işletme ve paket sonradan değiştirilemez;
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
    else
      new.business_id := old.business_id;
      new.customer_id := old.customer_id;
      new.customer_email := old.customer_email;
      new.package_id := old.package_id;
      new.created_at := old.created_at;
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
  if length(trim(p_customer_name)) > 100 then
    raise exception 'Adınız en fazla 100 karakter olabilir.';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 or length(v_phone) > 30 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
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

-- İşletme sahibi puan, abonelik ve askı alanlarını elle değiştiremez;
-- bunları sadece refresh_business_rating, apply_subscription ve admin_* fonksiyonları yazar.
-- Saat dilimi geçerli olmalı: geçersiz değer tüm işletmelerin ortak işlerini (hatırlatma, bekleme listesi) bozar.
create or replace function public.protect_business_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
      perform now() at time zone new.timezone;
    end if;
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

-- İşletme sahibi ödeme başlatır; tutar paketten alınır (istemciden değil). p_months: 1 (aylık) veya
-- 12 (yıllık: 10 ay fiyatına, 2 ay bedava).
create or replace function public.create_payment(p_plan_id text, p_months int default 1)
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

-- PayTR "başarılı" bildirimi: sadece sunucu (service_role) çağırır.
-- Aynı bildirim tekrar gelirse bir şey yapmaz. Yıllık ödeme 365, aylık 30 gün ekler.
-- Ücretli dönemde paket değişirse kalan süre yeni paketin fiyatına çevrilir (Esnaf'ın kalan 30 günü Pro'da ~19 gün):
-- ucuz paketin yıllığını alıp bir aylık Pro ödemesiyle tüm yıl Pro kullanılamasın. Denemenin kalan günleri aynen eklenir.
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
  select * into b from public.businesses where id = pay.business_id for update;
  if b.plan_id is distinct from pay.plan_id and b.subscription_ends_at > now()
     and b.subscription_ends_at is distinct from b.trial_ends_at then
    update public.businesses
    set subscription_ends_at = now() + (subscription_ends_at - now())
          * ((select p.price from public.plans p where p.id = b.plan_id)
             / (select p.price from public.plans p where p.id = pay.plan_id))::float8
    where id = b.id;
  end if;
  perform public.apply_subscription(pay.business_id, pay.plan_id, case when pay.months = 12 then 365 else 30 end);

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

commit;
