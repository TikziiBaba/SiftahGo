-- =====================================================================
-- Güvenlik ve yönetim paneli:
-- - Telefonla itibar zehirleme kapandı: hesapla alınan randevular "sık iptal / gelmeme" sayımında yalnızca hesapla
--   eşleşir; telefonla eşleşme yalnızca işletmenin elle eklediği (hesapsız) randevularda ve o işletmede yapılır.
-- - İşletme, hesapla alınan randevunun telefonunu değiştiremez.
-- - Randevu e-postaları her zaman müşterinin hesap adresine gider (istemcinin yazdığı adres yok sayılır).
-- - delete_my_account: müşteri hesabını silmeye hazırlar (web /api/account/delete).
-- - Yönetim: admin_dashboard (dönemli ayrıntılı istatistik), admin_activity (canlı akış), admin_users(p_id).
-- 20261024_esnaf_adresi.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Müşterinin son 6 aydaki iptal (kendi iptal ettiği) ve gelmediği randevu sayısı.
-- Hesapla alınan randevular yalnızca hesapla eşleşir (tüm işletmelerde). Telefon doğrulanmadığı için telefonla eşleşme
-- yalnızca bu işletmenin elle eklediği (hesapsız) randevularda yapılır: yoksa biri başkasının telefonuyla randevu alıp
-- iptal ederek onu tüm işletmelerde "sık iptal eden müşteri" gösterebilirdi.
create or replace function public.customer_history(p_customer uuid, p_phone text, p_business uuid, out cancels int, out no_shows int)
language sql stable security definer set search_path = ''
as $$
  select
    (count(*) filter (where a.status = 'cancelled' and a.cancelled_by = 'customer'))::int,
    (count(*) filter (where a.status = 'no_show'))::int
  from public.appointments a
  where a.starts_at > now() - interval '180 days'
    and (
      (p_customer is not null and a.customer_id = p_customer)
      or (a.customer_id is null and a.business_id = p_business
          and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
          and right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10))
    );
$$;

-- İşletme sahibi randevuyu doğrudan (RLS ile) yazarken: elle eklenen randevu bir müşteri hesabına veya e-postaya
-- bağlanamaz (başkasına bildirim, e-posta gönderilemez); hesap, e-posta, işletme ve paket sonradan değiştirilemez;
-- hesapla alınan randevunun telefonu da değiştirilemez (telefon değiştirilip "gelmedi" denerek başkası engellenemez);
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
    else
      new.business_id := old.business_id;
      new.customer_id := old.customer_id;
      new.customer_email := old.customer_email;
      new.package_id := old.package_id;
      new.created_at := old.created_at;
      if old.customer_id is not null then
        new.customer_phone := old.customer_phone;
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

-- Müşteri hesabını silmeye hazırlar (KVKK silme hakkı; asıl silme /api/account/delete ile auth.users'tan):
-- yaklaşan randevular iptal edilir (işletmeye haber gider), yorumlardaki ad kaldırılır. Randevu kayıtları
-- işletmenin defterinde hesapsız kalır. İşletme sahibinin hesabı burada silinmez.
create function public.delete_my_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  if exists (select 1 from public.businesses b where b.owner_id = v_uid) then
    raise exception 'İşletme hesabı buradan silinemez. Lütfen destek adresimize yazın.';
  end if;
  update public.appointments set status = 'cancelled'
  where customer_id = v_uid and status in ('pending', 'confirmed') and starts_at > now();
  update public.reviews set customer_name = 'Eski üye' where customer_id = v_uid;
end;
$$;

-- Eski imza (parametresiz) kaldırılır; yeni imzanın varsayılanı aynı çağrıyı karşılar.
drop function if exists public.admin_users();

-- Kullanıcı listesi: hesap bilgileri (auth.users) + profil + işletme. p_id verilirse yalnızca o kullanıcı.
create function public.admin_users(p_id uuid default null)
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
  left join public.businesses b on b.owner_id = u.id
  where p_id is null or u.id = p_id
  order by u.created_at desc;
end;
$$;

-- Yönetim > Genel Bakış ve Analitik: seçilen dönemin (İstanbul günleri, en fazla 366 gün) ayrıntılı sayıları.
-- "kpi" altındaki her değer {cur: bu dönem, prev: hemen önceki eşit uzunluktaki dönem}. Anlık durum (MRR, aktif
-- abonelik, kuyruk) "snapshot" altında admin_stats'tan gelir. Günlük "mrr": ödemelerin kapsadığı günlere bölünmüş
-- aylık tutar (tahmini; erken yenilemede çakışan günler iki kez sayılır).
create function public.admin_dashboard(p_from date, p_to date)
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
      left join public.businesses b on b.owner_id = u.id
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

-- Yönetim > Genel Bakış canlı akışı: son üyelikler, işletmeler, randevular, ödemeler ve yorumlar (en yeni önce).
create function public.admin_activity(p_limit int default 40)
returns table (kind text, occurred_at timestamptz, title text, detail text, ref_id uuid, slug text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  return query
  select x.kind, x.occurred_at, x.title, x.detail, x.ref_id, x.slug from (
    (select 'user'::text kind, u.created_at as occurred_at, coalesce(nullif(p.full_name, ''), u.email::text) title,
       case when p.role = 'business' then 'İşletme hesabı açtı' else 'Üye oldu' end detail, u.id ref_id, null::text slug
     from auth.users u left join public.profiles p on p.id = u.id
     order by u.created_at desc limit v_limit)
    union all
    (select 'business', b.created_at, b.name, concat_ws(' · ', b.category, nullif(b.city, '')), b.id, b.slug
     from public.businesses b order by b.created_at desc limit v_limit)
    union all
    (select 'appointment', a.created_at, bz.name,
       concat_ws(' · ', a.service_name, a.customer_name, case when a.customer_id is null then 'elle eklendi' end), bz.id, bz.slug
     from public.appointments a join public.businesses bz on bz.id = a.business_id
     order by a.created_at desc limit v_limit)
    union all
    (select 'payment', py.paid_at, bz.name,
       concat_ws(' · ', pl.name, case when py.months = 12 then 'yıllık' else 'aylık' end, py.amount::text || ' ₺',
                 case when py.merchant_oid like 'ADM%' then 'yönetici' end), bz.id, bz.slug
     from public.payments py join public.businesses bz on bz.id = py.business_id join public.plans pl on pl.id = py.plan_id
     where py.status = 'paid' order by py.paid_at desc limit v_limit)
    union all
    (select 'review', r.created_at, bz.name, r.rating::text || '★ ' || left(r.comment, 80), bz.id, bz.slug
     from public.reviews r join public.businesses bz on bz.id = r.business_id
     order by r.created_at desc limit v_limit)
  ) x
  order by x.occurred_at desc
  limit v_limit;
end;
$$;

commit;
