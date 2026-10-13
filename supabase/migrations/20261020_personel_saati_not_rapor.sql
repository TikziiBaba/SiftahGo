-- =====================================================================
-- Personele özel çalışma saatleri, müşteri notları, gelmeyen müşteriyi otomatik engelleme,
-- rapor özeti (doluluk + geri dönen müşteri).
-- 20261019_whatsapp_dogrulama_kaldir.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Personelin kendi çalışma saatleri. Bir gün için kaydı yoksa işletme saatleri geçerlidir.
create table public.staff_hours (
  staff_id   uuid not null references public.staff (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  is_open    boolean not null default true,
  open_time  time not null default '09:00',
  close_time time not null default '19:00',
  primary key (staff_id, weekday),
  check (close_time > open_time)
);

-- İşletmenin müşteri hakkındaki özel notu ("kısa kesim sever"). Telefonun son 10 hanesine bağlı.
create table public.customer_notes (
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone_key   text not null check (phone_key ~ '^[0-9]{10}$'),
  note        text not null default '' check (length(note) <= 1000),
  updated_at  timestamptz not null default now(),
  primary key (business_id, phone_key)
);

alter table public.staff_hours    enable row level security;
alter table public.customer_notes enable row level security;

create policy "personel saati: herkes okur" on public.staff_hours
  for select using (
    exists (
      select 1 from public.staff s
      where s.id = staff_id and (public.is_bookable(s.business_id) or public.is_business_owner(s.business_id))
    )
  );
create policy "personel saati: sahibi yönetir" on public.staff_hours
  for all using (
    exists (select 1 from public.staff s where s.id = staff_id and public.is_business_owner(s.business_id))
  )
  with check (
    exists (select 1 from public.staff s where s.id = staff_id and public.is_business_owner(s.business_id))
  );

-- Keşfet sıralaması: az yorumlu işletme 4,0'a çekilir (3 sanal oy); tek 5 yıldız, çok yorumlu 4,8'i geçemez.
alter table public.businesses
  add column rating_score numeric generated always as ((rating_avg * rating_count + 12) / (rating_count + 3)) stored;

create policy "müşteri notu: sahibi yönetir" on public.customer_notes
  for all using (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'))
  with check (public.is_business_owner(business_id) and public.plan_has_feature(business_id, 'customers'));

create or replace function public.get_available_slots(
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

-- Aynı işletmeye son 6 ayda 2 kez gelmeyen müşteri (hesap veya telefon) online randevudan
-- otomatik engellenir. İşletme engeli Ayarlar'dan kaldırabilir.
create function public.auto_block_no_show()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := right(regexp_replace(new.customer_phone, '\D', '', 'g'), 10);
begin
  if length(v_key) < 10 then v_key := null; end if;
  if exists (
    select 1 from public.blocked_customers bc
    where bc.business_id = new.business_id
      and (bc.customer_id = new.customer_id or bc.phone_key = v_key)
  ) then
    return new;
  end if;
  if (select count(*) from public.appointments a
      where a.business_id = new.business_id
        and a.status = 'no_show'
        and a.starts_at > now() - interval '180 days'
        and (a.customer_id = new.customer_id
             or right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = v_key)) >= 2 then
    insert into public.blocked_customers (business_id, customer_id, phone_key, customer_name)
    values (new.business_id, new.customer_id, v_key, new.customer_name);
  end if;
  return new;
end;
$$;

create trigger appointments_auto_block_no_show
  after update of status on public.appointments
  for each row when (new.status = 'no_show' and old.status is distinct from 'no_show')
  execute function public.auto_block_no_show();

-- Rapor özeti (tarihler işletme saatine göre):
-- doluluk = dolu randevu dakikası / personellerin çalışma dakikası;
-- geri dönen = dönemde gelen müşterilerden daha önce de tamamlanmış randevusu olanlar.
create function public.get_report_summary(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz        text;
  v_capacity  numeric;
  v_booked    numeric;
  v_customers int;
  v_returning int;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Yetkiniz yok.';
  end if;
  if not public.plan_has_feature(p_business_id, 'reports') then
    raise exception 'Raporlar paketinizde yok.';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Geçersiz tarih aralığı.';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;

  select coalesce(sum(extract(epoch from coalesce(sh.close_time, wh.close_time) - coalesce(sh.open_time, wh.open_time)) / 60), 0)
    into v_capacity
  from generate_series(p_from, p_to, interval '1 day') as d(day)
  join public.working_hours wh
    on wh.business_id = p_business_id and wh.weekday = extract(isodow from d.day) and wh.is_open
  join public.staff st on st.business_id = p_business_id and st.is_active
  left join public.staff_hours sh on sh.staff_id = st.id and sh.weekday = wh.weekday
  where coalesce(sh.is_open, true);

  select coalesce(sum(extract(epoch from a.ends_at - a.starts_at) / 60), 0)
    into v_booked
  from public.appointments a
  where a.business_id = p_business_id
    and a.status in ('pending', 'confirmed', 'completed')
    and (a.starts_at at time zone v_tz)::date between p_from and p_to;

  with visits as (
    select right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) as k, min(a.starts_at) as first_at
    from public.appointments a
    where a.business_id = p_business_id
      and a.status in ('confirmed', 'completed')
      and (a.starts_at at time zone v_tz)::date between p_from and p_to
    group by 1
  )
  select count(*)::int,
         (count(*) filter (where exists (
           select 1 from public.appointments p
           where p.business_id = p_business_id and p.status = 'completed'
             and p.starts_at < v.first_at
             and right(regexp_replace(p.customer_phone, '\D', '', 'g'), 10) = v.k
         )))::int
    into v_customers, v_returning
  from visits v;

  return jsonb_build_object(
    'capacity_minutes', round(v_capacity),
    'booked_minutes', round(v_booked),
    'customers', v_customers,
    'returning', v_returning
  );
end;
$$;

commit;
