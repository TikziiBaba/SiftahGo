-- =====================================================================
-- Destek talepleri (2026-11-01):
-- - Giriş yapmış kullanıcı (müşteri veya işletme sahibi) talep açar, kendi talebini görür ve yazar;
--   kapalı talebe yazınca talep yeniden açılır. Yönetici hepsini görür, yanıtlar ve kapatır.
-- - Her mesaj e-posta olarak gider (support_emails kuyruğu, /api/notifications gönderir).
-- 20261101_r2_cdn_adresi.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  business_id     uuid references public.businesses (id) on delete set null,
  audience        text not null check (audience in ('customer', 'business')),
  category        text not null check (category in ('randevu', 'odeme', 'hesap', 'teknik', 'sikayet', 'diger')),
  subject         text not null check (length(subject) between 3 and 120),
  status          text not null default 'waiting' check (status in ('waiting', 'answered', 'closed')),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at       timestamptz
);
create index support_tickets_user_idx on public.support_tickets (user_id, last_message_at desc);
create index support_tickets_status_idx on public.support_tickets (status, last_message_at desc);
create index support_tickets_business_idx on public.support_tickets (business_id);

create table public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  from_admin boolean not null default false,
  body       text not null check (length(body) between 2 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create table public.support_emails (
  message_id   uuid primary key references public.support_messages (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts     int not null default 0,
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index support_emails_pending_idx on public.support_emails (created_at) where status = 'pending';

create function public.support_add_message(p_ticket uuid, p_from_admin boolean, p_body text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if length(trim(coalesce(p_body, ''))) not between 2 and 4000 then
    raise exception 'Mesaj 2 ile 4000 karakter arasında olmalı.';
  end if;
  insert into public.support_messages (ticket_id, from_admin, body)
  values (p_ticket, p_from_admin, trim(p_body))
  returning id into v_id;
  insert into public.support_emails (message_id) values (v_id);
end;
$$;

create function public.support_check_rate(p_user uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select count(*) from public.support_messages m
      join public.support_tickets t on t.id = m.ticket_id
      where t.user_id = p_user and not m.from_admin and m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Çok sık mesaj gönderdiniz. Lütfen biraz sonra tekrar deneyin.';
  end if;
end;
$$;

create function public.open_support_ticket(p_category text, p_subject text, p_body text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_subject text := regexp_replace(trim(coalesce(p_subject, '')), '\s+', ' ', 'g');
  b         public.businesses;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  if length(v_subject) not between 3 and 120 then raise exception 'Konu 3 ile 120 karakter arasında olmalı.'; end if;
  perform public.support_check_rate(v_uid);
  if (select count(*) from public.support_tickets where user_id = v_uid and status <> 'closed') >= 5 then
    raise exception 'En fazla 5 açık talebiniz olabilir. Var olan talebinizden yazabilirsiniz.';
  end if;
  select * into b from public.businesses where owner_id = v_uid;
  insert into public.support_tickets (user_id, business_id, audience, category, subject)
  values (v_uid, b.id, case when b.approval_status = 'approved' then 'business' else 'customer' end, p_category, v_subject)
  returning id into v_id;
  perform public.support_add_message(v_id, false, p_body);
  return v_id;
end;
$$;

create function public.reply_support_ticket(p_id uuid, p_body text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform 1 from public.support_tickets where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  perform public.support_check_rate(auth.uid());
  perform public.support_add_message(p_id, false, p_body);
  update public.support_tickets
  set status = 'waiting', closed_at = null, last_message_at = now()
  where id = p_id;
end;
$$;

create function public.admin_reply_support_ticket(p_id uuid, p_body text, p_close boolean default false)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  perform 1 from public.support_tickets where id = p_id for update;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  perform public.support_add_message(p_id, true, p_body);
  update public.support_tickets
  set status = case when p_close then 'closed' else 'answered' end,
      closed_at = case when p_close then now() end,
      last_message_at = now()
  where id = p_id;
end;
$$;

create function public.admin_close_support_ticket(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  update public.support_tickets set status = 'closed', closed_at = now()
  where id = p_id and status <> 'closed';
  if not found then raise exception 'Bu talep zaten kapalı.'; end if;
end;
$$;

create function public.claim_support_emails(p_limit int default 10)
returns table (
  id            uuid,
  ticket_id     uuid,
  from_admin    boolean,
  is_first      boolean,
  user_email    text,
  user_name     text,
  audience      text,
  business_name text,
  category      text,
  subject       text,
  body          text,
  ticket_status text
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select e.message_id from public.support_emails e
    where e.status = 'pending' and (e.locked_until is null or e.locked_until < now())
    order by e.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.support_emails e
    set locked_until = now() + interval '5 minutes', attempts = e.attempts + 1
    from picked
    where e.message_id = picked.message_id
    returning e.message_id, e.created_at
  )
  select
    m.id, t.id, m.from_admin,
    not exists (select 1 from public.support_messages o where o.ticket_id = t.id and o.created_at < m.created_at),
    u.email::text, p.full_name, t.audience, b.name, t.category, t.subject, m.body, t.status
  from claimed c
  join public.support_messages m on m.id = c.message_id
  join public.support_tickets t on t.id = m.ticket_id
  join public.profiles p on p.id = t.user_id
  join auth.users u on u.id = t.user_id
  left join public.businesses b on b.id = t.business_id
  order by c.created_at;
end;
$$;

create function public.finish_support_email(p_id uuid, p_error text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.support_emails
  set status = case when p_error is null then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when p_error is null then now() end,
      last_error = left(p_error, 500)
  where message_id = p_id;
$$;

revoke execute on function public.support_add_message(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.support_check_rate(uuid) from public, anon, authenticated;
revoke execute on function public.claim_support_emails(int) from public, anon, authenticated;
revoke execute on function public.finish_support_email(uuid, text) from public, anon, authenticated;

alter table public.support_tickets  enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_emails   enable row level security;
create policy "destek: sahibi okur" on public.support_tickets
  for select using (user_id = (select auth.uid()));
create policy "admin: destek taleplerini okur" on public.support_tickets
  for select using ((select public.is_admin()));
create policy "destek mesajı: talep sahibi okur" on public.support_messages
  for select using (exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
create policy "admin: destek mesajlarını okur" on public.support_messages
  for select using ((select public.is_admin()));

commit;
