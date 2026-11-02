-- =====================================================================
-- Gecikme haberi (2026-11-04):
-- - Müşteri "geç kalacağım" der (5, 10 veya 15 dakika; randevudan en erken 2 saat önce, en fazla 3 kez),
--   işletme "gecikme var" der (10, 15, 30 veya 45 dakika; o personelin önümüzdeki 3 saatteki randevuları).
--   Randevu saati değişmez; karşı tarafa bildirim gider (delay_notices kuyruğu, /api/notifications gönderir).
-- - İstemci gecikme alanlarını doğrudan yazamaz (protect_appointment_columns).
-- 20261103_iki_ay_deneme.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

alter table public.appointments
  add column customer_late_minutes int check (customer_late_minutes in (5, 10, 15)),
  add column customer_late_at timestamptz,
  add column customer_late_count smallint not null default 0,
  add column business_delay_minutes int check (business_delay_minutes in (10, 15, 30, 45)),
  add column business_delay_at timestamptz,
  add column business_delay_count smallint not null default 0;

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

alter table public.delay_notices enable row level security;

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

-- Müşteri "geç kalacağım" der (5, 10 veya 15 dakika). Randevu saati değişmez; işletmeye haber kuyruğa girer.
-- Randevudan en erken 2 saat önce ve randevu bitmeden verilir; bir randevu için en fazla 3 haber.
create or replace function public.report_customer_late(p_id uuid, p_minutes int)
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
-- randevularına, haber sayısı 3'ü geçmemişse. Saatler değişmez. Haber verilen randevu sayısını döndürür.
create or replace function public.report_business_delay(p_staff_id uuid, p_minutes int)
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
create or replace function public.claim_delay_notices(p_limit int default 50)
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

commit;
