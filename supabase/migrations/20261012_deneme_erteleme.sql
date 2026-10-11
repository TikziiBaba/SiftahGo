-- =====================================================================
-- 7 gün ücretsiz Pro deneme ve randevu erteleme
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor'de çalıştırın. Veri silmez.
-- Hiç paket almamış mevcut işletmeler de bugünden itibaren 7 gün deneme alır.
-- =====================================================================

begin;

-- Deneme
alter table public.businesses add column trial_ends_at timestamptz;

-- İşletme sahibi puan, abonelik ve askı alanlarını elle değiştiremez;
-- bunları sadece refresh_business_rating, apply_subscription ve admin_* fonksiyonları yazar.
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
    else
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.plan_id := old.plan_id;
      new.subscription_ends_at := old.subscription_ends_at;
      new.trial_ends_at := old.trial_ends_at;
      new.is_suspended := old.is_suspended;
    end if;
  end if;
  return new;
end;
$$;

-- Yeni işletmeye varsayılan çalışma saatleri ve bir personel ekle.
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

  -- 7 gün ücretsiz deneme: Pro paketin tüm özellikleri.
  update public.businesses
  set plan_id = 'pro', subscription_ends_at = now() + interval '7 days', trial_ends_at = now() + interval '7 days'
  where id = new.id;
  return new;
end;
$$;

update public.businesses
set plan_id = 'pro', subscription_ends_at = now() + interval '7 days', trial_ends_at = now() + interval '7 days'
where subscription_ends_at is null;

-- Genel bakış sayıları ve son 30 günün günlük serisi (İstanbul günleri).
-- "active", "mrr" ve "by_plan" ücretli abonelikleri sayar; ücretsiz denemedekiler "trial"da.
create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'businesses', (select count(*) from public.businesses),
    'businesses_30d', (select count(*) from public.businesses where created_at > now() - interval '30 days'),
    'active', (select count(*) from public.businesses
               where subscription_ends_at > now() and subscription_ends_at is distinct from trial_ends_at),
    'trial', (select count(*) from public.businesses
              where subscription_ends_at > now() and subscription_ends_at = trial_ends_at),
    'live', (select count(*) from public.businesses
             where subscription_ends_at > now() and is_published and not is_suspended),
    'suspended', (select count(*) from public.businesses where is_suspended),
    'expiring_7d', (select count(*) from public.businesses
                    where subscription_ends_at > now() and subscription_ends_at <= now() + interval '7 days'),
    'expired', (select count(*) from public.businesses where subscription_ends_at <= now()),
    'never_paid', (select count(*) from public.businesses b
                   where not exists (select 1 from public.payments py where py.business_id = b.id and py.status = 'paid')),
    'mrr', (select coalesce(sum(p.price), 0) from public.businesses b
            join public.plans p on p.id = b.plan_id
            where b.subscription_ends_at > now() and b.subscription_ends_at is distinct from b.trial_ends_at),
    'revenue_total', (select coalesce(sum(amount), 0) from public.payments where status = 'paid'),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.payments
                    where status = 'paid' and paid_at > now() - interval '30 days'),
    'payments_failed_30d', (select count(*) from public.payments
                            where status = 'failed' and created_at > now() - interval '30 days'),
    'appointments', (select count(*) from public.appointments),
    'appointments_30d', (select count(*) from public.appointments where created_at > now() - interval '30 days'),
    'upcoming', (select count(*) from public.appointments
                 where status in ('pending', 'confirmed') and starts_at > now()),
    'gmv_30d', (select coalesce(sum(price), 0) from public.appointments
                where status = 'completed' and starts_at > now() - interval '30 days'),
    'reviews', (select count(*) from public.reviews),
    'by_status', (select coalesce(jsonb_object_agg(status, c), '{}') from (
                    select status, count(*) c from public.appointments group by status) x),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', p.id, 'name', p.name, 'price', p.price,
                  'count', (select count(*) from public.businesses b
                            where b.plan_id = p.id and b.subscription_ends_at > now()
                              and b.subscription_ends_at is distinct from b.trial_ends_at)
                ) order by p.sort_order), '[]') from public.plans p),
    'by_category', (select coalesce(jsonb_object_agg(category, c), '{}') from (
                      select category, count(*) c from public.businesses group by category) x),
    'by_city', (select coalesce(jsonb_object_agg(city, c), '{}') from (
                  select coalesce(nullif(city, ''), '—') city, count(*) c from public.businesses group by 1) x),
    'notifications', jsonb_build_object(
      'pending', (select count(*) from public.notifications where status = 'pending'),
      'failed', (select count(*) from public.notifications where status = 'failed'),
      'sent_24h', (select count(*) from public.notifications
                   where status = 'sent' and sent_at > now() - interval '24 hours')
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d,
        'users', (select count(*) from auth.users u
                  where (u.created_at at time zone 'Europe/Istanbul')::date = d),
        'businesses', (select count(*) from public.businesses b
                       where (b.created_at at time zone 'Europe/Istanbul')::date = d),
        'appointments', (select count(*) from public.appointments a
                         where (a.created_at at time zone 'Europe/Istanbul')::date = d),
        'revenue', (select coalesce(sum(amount), 0) from public.payments py
                    where py.status = 'paid' and (py.paid_at at time zone 'Europe/Istanbul')::date = d)
      ) order by d)
      from (select (v_today - g)::date d from generate_series(0, 29) g) days
    )
  );
end;
$$;

-- Erteleme
drop function public.get_available_slots(uuid, uuid, date, uuid);
-- Belirli bir gün için boş saatler. p_staff_id boşsa tüm personel.
-- p_ignore: ertelenen randevu; müşterisi veya işletmesi soruyorsa o randevunun saati boş sayılır.
create function public.get_available_slots(
  p_business_id uuid,
  p_service_id  uuid,
  p_day         date,
  p_staff_id    uuid default null,
  p_ignore      uuid default null
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

  select make_interval(mins => s.duration_minutes) into v_duration
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;
  if v_duration is null then return; end if;

  v_today := (now() at time zone b.timezone)::date;
  if p_day < v_today or p_day > v_today + b.booking_days then return; end if;

  select * into wh from public.working_hours
  where business_id = p_business_id and weekday = extract(isodow from p_day);
  if not found or not wh.is_open then return; end if;

  return query
  select g.s, st.id
  from generate_series(
         (p_day + wh.open_time) at time zone b.timezone,
         ((p_day + wh.close_time) at time zone b.timezone) - v_duration,
         make_interval(mins => b.slot_minutes)
       ) as g(s)
  cross join public.staff st
  where st.business_id = p_business_id
    and st.is_active
    and (p_staff_id is null or st.id = p_staff_id)
    and (
      not exists (select 1 from public.staff_services ss where ss.staff_id = st.id)
      or exists (select 1 from public.staff_services ss where ss.staff_id = st.id and ss.service_id = p_service_id)
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

-- Gelecekteki randevunun saatini değiştirir: müşterisi (girişli) veya işletme sahibi.
-- Yeni saat boş saatlerden olmalı. p_staff_id boşsa uygun ilk personel.
-- Müşteri değiştirdiyse ve işletme randevuları elle onaylıyorsa randevu yeniden onay bekler.
create function public.reschedule_appointment(p_id uuid, p_starts_at timestamptz, p_staff_id uuid default null)
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
      status = case when not v_owner and not b.auto_confirm then 'pending' else a.status end
  where id = a.id;
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder'));
alter table public.inbox drop constraint inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder'));

-- Uygulama içi bildirim ekler; eklendiyse 1 döner.
create or replace function public.inbox_insert(p_user uuid, p_kind text, p_recipient text, a public.appointments)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business text;
  v_when     text;
  v_title    text;
  v_n        int;
begin
  select b.name, public.format_when(a.starts_at, b.timezone) into v_business, v_when
  from public.businesses b where b.id = a.business_id;

  v_title := case
    when p_recipient = 'business' and p_kind = 'rescheduled' and a.status = 'pending' then 'Saat değişikliği onay bekliyor'
    when p_recipient = 'business' and p_kind = 'rescheduled' then 'Randevu saati değişti'
    when p_kind = 'rescheduled' then 'Randevunuzun saati değişti'
    when p_recipient = 'business' and p_kind = 'cancelled' then 'Randevu iptal edildi'
    when p_recipient = 'business' and a.status = 'pending' then 'Onay bekleyen randevu'
    when p_recipient = 'business' then 'Yeni randevu'
    when p_kind = 'cancelled' then 'Randevunuz iptal edildi'
    when p_kind = 'reminder' then 'Randevunuz yaklaşıyor'
    when a.status = 'pending' then 'Randevu talebiniz alındı'
    else 'Randevunuz onaylandı'
  end;

  insert into public.inbox (user_id, appointment_id, kind, recipient, title, body)
  values (
    p_user, a.id, p_kind, p_recipient, v_title,
    concat_ws(' · ', case when p_recipient = 'business' then a.customer_name else v_business end,
              a.service_name, v_when)
  )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Randevu alınınca, onaylanınca, iptal edilince veya saati değişince ilgili tarafa e-posta kuyruğa girer.
-- Uygulama içi bildirim (ve push) sadece karşı tarafa gider: kendi aldığı randevu için
-- müşteriye, kendi eklediği randevu için işletmeye bildirim gitmez.
create or replace function public.queue_appointment_notifications()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner_email text;
  v_owner_id    uuid;
  v_by_owner    boolean := public.is_business_owner(new.business_id);
  v_kind        text;
  v_to          text;
begin
  if new.starts_at <= now() then return null; end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'confirmed') then return null; end if;
    v_kind := 'booked';
    -- İşletme kendi eklediği randevu için kendine e-posta almaz.
    v_to := case when v_by_owner then 'customer' else 'both' end;
  elsif old.status in ('pending', 'confirmed') and new.status = 'cancelled' then
    v_kind := 'cancelled';
    -- İptal edene değil, karşı tarafa haber verilir.
    v_to := case when v_by_owner then 'customer' else 'business' end;
  elsif old.status in ('pending', 'confirmed') and new.status in ('pending', 'confirmed')
        and new.starts_at <> old.starts_at then
    v_kind := 'rescheduled';
    v_to := case when v_by_owner then 'customer' else 'business' end;
    -- Her saat değişikliği yeniden bildirilir; hatırlatma ve onay yeni saat için tekrar gidebilir.
    delete from public.notifications
    where appointment_id = new.id and kind in ('rescheduled', 'reminder', 'confirmed');
    delete from public.inbox
    where appointment_id = new.id and kind in ('rescheduled', 'reminder', 'confirmed');
  elsif old.status = 'pending' and new.status = 'confirmed' then
    v_kind := 'confirmed';
    v_to := 'customer';
  else
    return null;
  end if;

  if v_to in ('customer', 'both') and new.customer_email is not null then
    insert into public.notifications (appointment_id, kind, recipient, email)
    values (new.id, v_kind, 'customer', new.customer_email)
    on conflict do nothing;
  end if;

  if v_to in ('business', 'both') then
    select u.email, u.id into v_owner_email, v_owner_id
    from public.businesses b join auth.users u on u.id = b.owner_id
    where b.id = new.business_id;
    if v_owner_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (new.id, v_kind, 'business', v_owner_email)
      on conflict do nothing;
    end if;
  end if;

  if v_to = 'customer' and new.customer_id is not null then
    perform public.inbox_insert(new.customer_id, v_kind, 'customer', new);
  elsif v_to in ('business', 'both') and v_owner_id is not null then
    perform public.inbox_insert(v_owner_id, v_kind, 'business', new);
  end if;
  return null;
end;
$$;

drop trigger appointments_queue_notifications on public.appointments;
create trigger appointments_queue_notifications
  after insert or update of status, starts_at on public.appointments
  for each row execute function public.queue_appointment_notifications();

commit;
