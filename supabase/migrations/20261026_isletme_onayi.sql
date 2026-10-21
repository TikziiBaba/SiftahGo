-- =====================================================================
-- İşletme başvuru onayı:
-- - Yeni işletme "onay bekliyor" açılır; yönetici (Yönetim > Başvurular) onaylar ya da sebebiyle reddeder
--   (admin_review_business). Onaylanmayan işletme görünmez, randevu ve ödeme almaz.
-- - 7 gün ücretsiz Pro deneme kayıtta değil, onayda başlar.
-- - Reddedilen işletmenin sahibi bilgilerini düzeltip yeniden başvurur (approval_status 'rejected' -> 'pending').
-- - Mevcut işletmeler onaylı sayılır.
-- 20261025_guvenlik_yonetim.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Mevcut işletmeler 'approved' ile eklenir; bundan sonra açılanlar 'pending' başlar.
alter table public.businesses
  add column approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  add column approval_note   text not null default '' check (length(approval_note) <= 500),
  add column submitted_at    timestamptz not null default now(),
  add column reviewed_at     timestamptz,
  add column reviewed_by     uuid references public.profiles (id) on delete set null;
alter table public.businesses alter column approval_status set default 'pending';
update public.businesses set submitted_at = created_at;
create index businesses_pending_idx on public.businesses (submitted_at) where approval_status = 'pending';

-- İşletme herkese açık mı: onaylı, yayında, askıda değil ve aboneliği süren.
create or replace function public.is_bookable(bid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = bid and approval_status = 'approved' and is_published and not is_suspended and subscription_ends_at > now()
  );
$$;

-- Yeni işletmeye varsayılan çalışma saatleri ve bir personel ekle. Ücretsiz deneme onayla başlar (admin_review_business).
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

  insert into public.staff (business_id, name)
  values (new.id, coalesce(v_owner_name, new.name));

  update public.profiles set role = 'business' where id = new.owner_id;
  return new;
end;
$$;

-- İşletme sahibi puan, abonelik, askı ve onay alanlarını elle değiştiremez;
-- bunları sadece refresh_business_rating, apply_subscription ve admin_* fonksiyonları yazar.
-- Tek istisna: reddedilen başvuru yeniden gönderilebilir (approval_status 'rejected' -> 'pending').
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
      new.approval_status := 'pending';
      new.approval_note := '';
      new.submitted_at := now();
      new.reviewed_at := null;
      new.reviewed_by := null;
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

-- İşletme sahibi ödeme başlatır; tutar paketten alınır (istemciden değil). p_months: 1 (aylık) veya
-- 12 (yıllık: 10 ay fiyatına, 2 ay bedava).
create or replace function public.create_payment(p_plan_id text, p_months int default 1)
returns table (merchant_oid text, amount numeric, plan_name text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_status text;
  v_plan public.plans;
  v_oid text;
  v_amount numeric;
begin
  select id, approval_status into v_business, v_status from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Önce işletmenizi oluşturun.'; end if;
  -- Reddedilebilecek başvurudan para alınmaz.
  if v_status <> 'approved' then raise exception 'Başvurunuz onaylanınca paket seçebilirsiniz.'; end if;
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

-- Ödeme almadan (veya elden/havale ödemeyi kaydederek) paket tanımlar ya da süre uzatır.
-- Ödeme geçmişinde "ADM" ile başlayan kayıt olarak görünür.
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

  insert into public.payments (business_id, plan_id, merchant_oid, amount, status, paid_at)
  values (
    p_business_id, p_plan_id,
    'ADM' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || substr(md5(gen_random_uuid()::text), 1, 8),
    p_amount, 'paid', now()
  );
  perform public.apply_subscription(p_business_id, p_plan_id, p_days);
end;
$$;

-- İşletme başvurusunu onaylar ya da reddeder (ret sebebi zorunlu, işletme sahibine gösterilir).
-- Onayda işletmenin hiç aboneliği olmadıysa 7 gün ücretsiz deneme başlar: Pro paketin tüm özellikleri.
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
        plan_id = case when subscription_ends_at is null then 'pro' else plan_id end,
        trial_ends_at = case when subscription_ends_at is null then now() + interval '7 days' else trial_ends_at end,
        subscription_ends_at = coalesce(subscription_ends_at, now() + interval '7 days')
    where id = p_business_id;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Ret sebebini yazın.'; end if;
    update public.businesses
    set approval_status = 'rejected', approval_note = left(trim(p_note), 500), reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_business_id;
  end if;
end;
$$;

drop policy "işletme: yayındakileri herkes okur" on public.businesses;
create policy "işletme: yayındakileri herkes okur" on public.businesses
  for select using (
    (approval_status = 'approved' and is_published and not is_suspended and subscription_ends_at > now())
    or owner_id = auth.uid()
  );

commit;
