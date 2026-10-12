-- =====================================================================
-- Sahte randevu koruması: randevu için giriş zorunlu, WhatsApp ile telefon doğrulama
-- (yönetici açınca zorunlu olur), kişi başı randevu sınırları ve işletmenin müşteri engellemesi.
-- 20261016_paket_fiyatlari.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor. Veri silmez.
-- =====================================================================

begin;

-- Site ayarları (tek satır). Yönetici panelinden değişir.
-- phone_verification: açıkken randevu için hesabın telefonu WhatsApp ile doğrulanmış olmalı.
create table public.app_settings (
  id                 boolean primary key default true check (id),
  phone_verification boolean not null default false,
  -- Doğrulama kodunun gönderileceği WhatsApp Business numarası (ülke koduyla, sadece rakam).
  whatsapp_number    text not null default '' check (whatsapp_number ~ '^[0-9]{0,15}$'),
  check (not phone_verification or length(whatsapp_number) >= 10)
);
insert into public.app_settings default values;

-- Telefon doğrulama (WhatsApp ters doğrulama): müşteri start_phone_verification ile kod alır ve
-- kodu SiftahGo WhatsApp numarasına yollar; sunucu (/api/whatsapp) gönderenin numarasıyla
-- confirm_phone_verification çağırır. Kullanıcı bu tabloya yazamaz.
create table public.phone_verifications (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  code            text unique,
  code_expires_at timestamptz,
  -- Doğrulanmış numara ('+905551112233'). Bir numara tek hesaba ait olur.
  phone           text unique,
  verified_at     timestamptz
);

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

drop function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text);
-- Girişli müşteri randevu alır. p_staff_id boşsa uygun ilk personel.
-- Telefon doğrulaması açıksa randevuya hesabın doğrulanmış numarası yazılır (p_customer_phone yok sayılır).
-- Sahte randevuya karşı: işletmenin engellediği müşteri alamaz; aynı işletmede en fazla 3, toplamda
-- en fazla 10 yaklaşan randevu; 24 saatte en fazla 10 randevu.
-- Dönen: {id, status}. Sık iptal eden müşterinin randevusu işletme onayına düşer (status = pending).
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
  if (select st.phone_verification from public.app_settings st) then
    select pv.phone into v_phone from public.phone_verifications pv
    where pv.user_id = v_uid and pv.verified_at is not null;
    if v_phone is null then
      raise exception 'Randevu almak için telefon numaranızı doğrulayın.';
    end if;
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

  return jsonb_build_object('id', v_id, 'status', v_status);
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

-- Telefon doğrulama kodu üretir (15 dakika geçerli). Müşteri kodu WhatsApp'tan gönderir.
create function public.start_phone_verification()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'Giriş yapmalısınız.'; end if;
  loop
    v_code := 'SG' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    begin
      insert into public.phone_verifications (user_id, code, code_expires_at)
      values (auth.uid(), v_code, now() + interval '15 minutes')
      on conflict (user_id) do update set code = excluded.code, code_expires_at = excluded.code_expires_at;
      return v_code;
    exception when unique_violation then
      -- Kod başka bir kullanıcıda; yenisini dene.
    end;
  end loop;
end;
$$;

-- Sunucu (WhatsApp webhook) çağırır: p_from mesajı gönderen numara. Kod geçerliyse numarayı
-- hesaba bağlar; numara başka hesapta doğrulanmışsa oradan kaldırılır. Doğrulanan kullanıcıyı döner.
create function public.confirm_phone_verification(p_code text, p_from text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user  uuid;
  v_phone text := '+' || regexp_replace(coalesce(p_from, ''), '\D', '', 'g');
begin
  if length(v_phone) < 11 then return null; end if;
  select pv.user_id into v_user from public.phone_verifications pv
  where pv.code = upper(trim(p_code)) and pv.code_expires_at > now();
  if v_user is null then return null; end if;

  update public.phone_verifications set phone = null, verified_at = null
  where phone = v_phone and user_id <> v_user;
  update public.phone_verifications
  set phone = v_phone, verified_at = now(), code = null, code_expires_at = null
  where user_id = v_user;
  update public.profiles set phone = v_phone where id = v_user;
  return v_user;
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

revoke execute on function public.confirm_phone_verification(text, text) from public, anon, authenticated;


-- app_settings: herkes okur, yönetici değiştirir.
alter table public.app_settings        enable row level security;
-- phone_verifications: kullanıcı kendi satırını okur; yazma sadece fonksiyonlarla.
alter table public.phone_verifications enable row level security;
alter table public.blocked_customers   enable row level security;

create policy "ayar: herkes okur" on public.app_settings
  for select using (true);
create policy "ayar: yönetici günceller" on public.app_settings
  for update using (public.is_admin()) with check (public.is_admin());
create policy "telefon doğrulama: kendininkini okur" on public.phone_verifications
  for select using (user_id = auth.uid());
-- Engelleme block_customer ile eklenir; işletme listeyi görür ve engeli kaldırır.
create policy "engel: işletme okur" on public.blocked_customers
  for select using (public.is_business_owner(business_id));
create policy "engel: işletme kaldırır" on public.blocked_customers
  for delete using (public.is_business_owner(business_id));

commit;
