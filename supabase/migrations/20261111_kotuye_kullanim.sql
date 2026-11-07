-- =====================================================================
-- Kötüye kullanım kapatıldı:
-- - Değerlendirme: işletmenin işaretlemediği randevu bittikten 2 saat sonra değerlendirilebilir; sonradan "Gelmedi"
--   veya iptal denirse yorum silinir (gelmeyen hesap puan düşüremez). Tamamlanan randevunun yorumu kalır.
-- - Seans paketi bir hesaba bağlanır (satışta bu telefonla gelmiş son hesap, yoksa ilk hesaplı kullanım): başkasının
--   telefonunu yazan onun paketinden seans düşemez.
-- - Hesabını silip aynı e-postayla 1 yıl içinde yeniden açan kupon haklarını, iptal/gelmedi geçmişini, engellerini ve
--   paketlerini devralır (yalnızca e-postanın sha256 özeti saklanır: deleted_accounts).
-- - Müşteri bir randevunun saatini en fazla 3 kez değiştirebilir.
-- 20261110_yorum_dogum_gunu_kotuye_kullanim.sql'den SONRA çalıştırın. Web yayını beklemez.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

alter table public.session_packages
  add column if not exists customer_id uuid references public.profiles (id) on delete set null,
  add column if not exists former_email_hash text;
alter table public.appointments
  add column if not exists reschedule_count smallint not null default 0,
  add column if not exists former_email_hash text;
alter table public.coupon_claims add column if not exists former_email_hash text;
alter table public.blocked_customers add column if not exists former_email_hash text;

-- Engel hesap silinince kaybolmasın: bağ boşalır, e-posta özetiyle yeni hesaba taşınır.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.blocked_customers'::regclass
      and ((contype = 'f' and pg_get_constraintdef(oid) like '%(customer_id)%')
           or (contype = 'c' and pg_get_constraintdef(oid) like '%phone_key IS NOT NULL%'))
  loop
    execute format('alter table public.blocked_customers drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.blocked_customers
  add constraint blocked_customers_customer_id_fkey foreign key (customer_id) references public.profiles (id) on delete set null,
  add constraint blocked_customers_check check (customer_id is not null or phone_key is not null or former_email_hash is not null);

create table if not exists public.deleted_accounts (
  email_hash text primary key,
  deleted_at timestamptz not null default now()
);
alter table public.deleted_accounts enable row level security;

create or replace function public.email_hash(p_email text)
returns text
language sql immutable set search_path = ''
as $$
  select case when nullif(trim(coalesce(p_email, '')), '') is null then null
              else encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex') end;
$$;
revoke execute on function public.email_hash(text) from public, anon, authenticated;

create or replace function public.reattach_deleted_account(p_user uuid, p_email text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hash text := public.email_hash(p_email);
begin
  if v_hash is null or not exists (
    select 1 from public.deleted_accounts d where d.email_hash = v_hash and d.deleted_at > now() - interval '1 year'
  ) then
    return;
  end if;
  update public.coupon_claims cl set customer_id = p_user, former_email_hash = null
  where cl.former_email_hash = v_hash
    and not exists (select 1 from public.coupon_claims x where x.coupon_id = cl.coupon_id and x.customer_id = p_user);
  update public.appointments set customer_id = p_user, former_email_hash = null where former_email_hash = v_hash;
  update public.blocked_customers set customer_id = p_user, former_email_hash = null where former_email_hash = v_hash;
  update public.session_packages set customer_id = p_user, former_email_hash = null where former_email_hash = v_hash;
  delete from public.deleted_accounts where email_hash = v_hash;
end;
$$;
revoke execute on function public.reattach_deleted_account(uuid, text) from public, anon, authenticated;

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
  -- Google ile girişte adres kayıtta onaylıdır; e-postayla kayıtta onay handle_user_confirmed'da gelir.
  if new.email_confirmed_at is not null then
    perform public.reattach_deleted_account(new.id, new.email);
  end if;
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.reattach_deleted_account(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

create or replace function public.use_package_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pkg uuid;
begin
  -- Kuponlu randevu paketten seans düşmez. Hesapla alınan randevu yalnızca o hesabın ya da henüz hesaba bağlanmamış
  -- paketten düşer (telefon doğrulanmaz: başkasının telefonunu yazan onun paketini kullanamasın); ilk kullanımda paket
  -- o hesaba bağlanır. İşletmenin elle eklediği (hesapsız) randevu telefonla eşleşir.
  if new.status = 'completed' and old.status is distinct from 'completed' and new.service_id is not null
     and new.coupon_claim_id is null then
    select p.id into v_pkg
    from public.session_packages p
    where p.business_id = new.business_id
      and p.service_id = new.service_id
      and p.phone_key = right(regexp_replace(new.customer_phone, '\D', '', 'g'), 10)
      and p.used < p.total
      and (new.customer_id is null or p.customer_id is null or p.customer_id = new.customer_id)
    order by (p.customer_id is not null) desc, p.created_at
    limit 1
    for update;
    if v_pkg is not null then
      update public.session_packages
      set used = used + 1, customer_id = coalesce(customer_id, new.customer_id)
      where id = v_pkg;
      new.package_id := v_pkg;
    end if;
  elsif old.status = 'completed' and new.status is distinct from 'completed' and old.package_id is not null then
    update public.session_packages set used = greatest(used - 1, 0) where id = old.package_id;
    new.package_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.session_packages_bind()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.customer_id is null then
    select a.customer_id into new.customer_id
    from public.appointments a
    where a.business_id = new.business_id and a.customer_id is not null
      and right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = new.phone_key
      and a.starts_at <= now() and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()))
    order by a.starts_at desc
    limit 1;
  end if;
  new.former_email_hash := null;
  return new;
end;
$$;

drop trigger if exists session_packages_bind on public.session_packages;
create trigger session_packages_bind
  before insert on public.session_packages
  for each row execute function public.session_packages_bind();

-- Var olan paketler: bu telefonla bu işletmede gerçekleşmiş son hesaplı randevunun hesabına bağlanır.
update public.session_packages p
set customer_id = (
  select a.customer_id from public.appointments a
  where a.business_id = p.business_id and a.customer_id is not null
    and right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = p.phone_key
    and a.starts_at <= now() and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()))
  order by (a.package_id = p.id) desc nulls last, a.starts_at desc
  limit 1
)
where p.customer_id is null;

create or replace function public.add_review(p_appointment_id uuid, p_rating int, p_comment text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_name text;
begin
  select * into a from public.appointments
  where id = p_appointment_id and customer_id = auth.uid()
    and (status = 'completed' or (status = 'confirmed' and ends_at <= now() - interval '2 hours'));
  if not found then
    raise exception 'Sadece tamamlanan randevularınızı değerlendirebilirsiniz.';
  end if;
  if exists (select 1 from public.businesses b where b.id = a.business_id and b.owner_id = auth.uid()) then
    raise exception 'Kendi işletmenizi değerlendiremezsiniz.';
  end if;
  if a.starts_at > now() then
    raise exception 'Randevu saatiniz geldikten sonra değerlendirebilirsiniz.';
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

create or replace function public.appointments_drop_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.reviews r where r.appointment_id = new.id;
  return null;
end;
$$;

drop trigger if exists appointments_drop_review on public.appointments;
create trigger appointments_drop_review
  after update of status on public.appointments
  for each row when (new.status in ('no_show', 'cancelled') and old.status in ('pending', 'confirmed'))
  execute function public.appointments_drop_review();

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
      status = case when not v_owner and public.needs_confirmation(b, a.customer_id) then 'pending' else a.status end,
      reschedule_count = a.reschedule_count + case when v_owner then 0 else 1 end
  where id = a.id;
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

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
  update public.reviews set customer_name = 'Eski üye' where customer_id = v_uid;
  -- Hesabın e-posta adresi işletmelerin defterinde ve gönderim kayıtlarında kalmaz.
  delete from public.notifications n using public.appointments a
  where a.id = n.appointment_id and a.customer_id = v_uid and n.recipient = 'customer';
  update public.appointments set customer_email = null where customer_id = v_uid;
end;
$$;

create or replace function public.claim_birthday_gifts(p_limit int default 50)
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
      and exists (select 1 from public.appointments a
                  where a.business_id = b.id and a.customer_id = p.id and a.starts_at > now() - interval '2 years'
                    and a.starts_at <= now()
                    and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now())))
      and not exists (select 1 from public.blocked_customers k where k.business_id = b.id and k.customer_id = p.id)
      and not exists (
        select 1 from public.birthday_gifts g
        where g.business_id = b.id and g.customer_id = p.id
          and (g.year = extract(year from public.next_birthday(p.birth_month, p.birth_day, t.today))::int
               or g.created_at > now() - interval '300 days')
      )
      and not exists (
        select 1 from public.coupon_claims cl join public.coupons c on c.id = cl.coupon_id
        where cl.business_id = b.id and cl.customer_id = p.id and c.is_birthday and cl.created_at > now() - interval '300 days'
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

commit;
