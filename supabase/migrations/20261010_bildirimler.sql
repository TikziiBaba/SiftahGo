-- =====================================================================
-- Uygulama içi bildirimler ve anlık bildirim (push)
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor'de çalıştırın.
-- Veri silmez. (schema.sql tüm verileri silerek sıfırdan kurar; canlıda onu çalıştırmayın.)
-- =====================================================================

begin;

-- Telefonların Expo push adresleri. Uygulama register_push_token ile ekler.
create table public.push_tokens (
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- Uygulama içi bildirimler. Her satır kullanıcının telefonlarına anlık bildirim olarak da
-- gider: sunucu (/api/notifications) claim_push ile alıp Expo'ya iletir.
create table public.inbox (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  appointment_id    uuid not null references public.appointments (id) on delete cascade,
  kind              text not null check (kind in ('booked', 'confirmed', 'cancelled', 'reminder')),
  recipient         text not null check (recipient in ('customer', 'business')),
  title             text not null,
  body              text not null,
  read_at           timestamptz,
  push_status       text not null default 'pending' check (push_status in ('pending', 'sent', 'failed', 'skipped')),
  push_attempts     int not null default 0,
  push_locked_until timestamptz,
  created_at        timestamptz not null default now(),
  unique (appointment_id, kind, recipient)
);
create index inbox_user_idx on public.inbox (user_id, created_at desc);
create index inbox_push_pending_idx on public.inbox (created_at) where push_status = 'pending';

-- "12 Ekim Pazartesi, 14:30" (e-postalardaki biçim)
create or replace function public.format_when(p_at timestamptz, p_tz text)
returns text
language sql stable set search_path = ''
as $$
  select extract(day from l)::int || ' '
    || (array['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos',
              'Eylül', 'Ekim', 'Kasım', 'Aralık'])[extract(month from l)::int] || ' '
    || (array['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'])[extract(isodow from l)::int]
    || ', ' || to_char(l, 'HH24:MI')
  from (select p_at at time zone p_tz as l) t;
$$;

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

-- Randevu alınınca, onaylanınca veya iptal edilince ilgili tarafa e-posta kuyruğa girer.
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
  elsif old.status = 'pending' and new.status = 'confirmed' then
    v_kind := 'confirmed';
    v_to := 'customer';
  elsif old.status in ('pending', 'confirmed') and new.status = 'cancelled' then
    v_kind := 'cancelled';
    -- İptal edene değil, karşı tarafa haber verilir.
    v_to := case when v_by_owner then 'customer' else 'business' end;
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

-- Zamanı gelen hatırlatmaları kuyruğa ekler; eklenen sayıyı döner.
-- Önceden alınan randevuya 24 saat kala, 24 saatten kısa süre kala alınana 2 saat kala
-- hatırlatılır. Başlamasına 3 saatten az kala alınan randevuya hatırlatma gitmez.
-- Girişli müşteriye uygulama içi bildirim de eklenir.
create or replace function public.queue_due_reminders()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a   public.appointments;
  v_n int := 0;
  v_i int;
begin
  for a in
    select * from public.appointments ap
    where ap.status = 'confirmed'
      and (ap.customer_email is not null or ap.customer_id is not null)
      and ap.starts_at > now()
      and ap.created_at < ap.starts_at - interval '3 hours'
      and ap.starts_at <= now() + case
            when ap.created_at <= ap.starts_at - interval '24 hours' then interval '24 hours'
            else interval '2 hours'
          end
  loop
    if a.customer_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (a.id, 'reminder', 'customer', a.customer_email)
      on conflict do nothing;
      get diagnostics v_i = row_count;
      v_n := v_n + v_i;
    end if;
    if a.customer_id is not null then
      v_n := v_n + public.inbox_insert(a.customer_id, 'reminder', 'customer', a);
    end if;
  end loop;
  return v_n;
end;
$$;

-- Gönderilecek anlık bildirimleri kullanıcının telefon adresleriyle birlikte alır.
-- Telefonu kayıtlı olmayanlar ve anlamı kalmayanlar atlanır; alınan kayıt 5 dakika kilitlenir.
create or replace function public.claim_push(p_limit int default 50)
returns table (
  id             uuid,
  kind           text,
  recipient      text,
  appointment_id uuid,
  title          text,
  body           text,
  tokens         text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.inbox i
  set push_status = 'skipped'
  from public.appointments a
  where a.id = i.appointment_id
    and i.push_status = 'pending'
    and (a.starts_at <= now()
         or (i.kind <> 'cancelled' and a.status not in ('pending', 'confirmed'))
         or not exists (select 1 from public.push_tokens t where t.user_id = i.user_id));

  return query
  with picked as (
    select i.id from public.inbox i
    where i.push_status = 'pending' and (i.push_locked_until is null or i.push_locked_until < now())
    order by i.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.inbox i
    set push_locked_until = now() + interval '5 minutes', push_attempts = i.push_attempts + 1
    from picked
    where i.id = picked.id
    returning i.*
  )
  select c.id, c.kind, c.recipient, c.appointment_id, c.title, c.body,
         array(select t.token from public.push_tokens t where t.user_id = c.user_id order by t.token)
  from claimed c
  order by c.created_at;
end;
$$;

-- Gönderim sonucu; finish_notification ile aynı kurallar.
create or replace function public.finish_push(p_id uuid, p_error text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.inbox
  set push_status = case when p_error is null then 'sent' when push_attempts >= 5 then 'failed' else 'pending' end
  where id = p_id;
$$;

-- Expo'nun "DeviceNotRegistered" dediği adresler (uygulama kaldırılmış) silinir.
create or replace function public.drop_push_tokens(p_tokens text[])
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_tokens where token = any (p_tokens);
$$;

-- Telefon adresini giriş yapan kullanıcıya bağlar. Aynı telefonda hesap değişirse adres yeni hesaba geçer.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız.';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- Çıkış yaparken çağrılır.
create or replace function public.unregister_push_token(p_token text)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- Bildirimi okundu yapar; p_id boşsa hepsini.
create or replace function public.mark_inbox_read(p_id uuid default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.inbox set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
$$;
revoke execute on function public.inbox_insert(uuid, text, text, public.appointments) from public, anon, authenticated;
revoke execute on function public.claim_push(int) from public, anon, authenticated;
revoke execute on function public.finish_push(uuid, text) from public, anon, authenticated;
revoke execute on function public.drop_push_tokens(text[]) from public, anon, authenticated;

alter table public.push_tokens enable row level security;
alter table public.inbox       enable row level security;

create policy "bildirim: kendininkini okur" on public.inbox
  for select using (user_id = auth.uid());

alter publication supabase_realtime add table public.inbox;

commit;
