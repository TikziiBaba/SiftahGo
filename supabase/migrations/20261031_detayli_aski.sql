-- =====================================================================
-- Detaylı askı (2026-10-31):
-- - Yönetici sebep, not ve süreyle askıya alır; süre dolunca askı kendiliğinden kalkar (lift_due_suspensions,
--   /api/notifications çağırır). Yaklaşan randevuları iptal edip müşteriye haber vermeyi seçebilir.
-- - Askıda geçen süre askı kalkınca aboneliğe eklenir. Her askı business_suspensions'ta kalır.
-- - İşletme sahibi askıya alamaz, dondurma talebi açar (request_freeze); yönetici uygular ya da reddeder.
-- - İşletme sahibinin işletmeyi (randevu ve ödeme kayıtlarıyla birlikte) API'den kalıcı silme yetkisi kapanır.
-- 20261030_guvenlik_kilitler.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

create table public.business_suspensions (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  reason                 text not null check (reason in ('kural_ihlali', 'odeme', 'sikayet', 'sahip_talebi', 'diger')),
  note                   text not null default '' check (length(note) <= 500),
  until                  timestamptz,
  appointments_cancelled int not null default 0,
  pause_subscription     boolean not null default false,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  lifted_at              timestamptz,
  lifted_by              uuid references public.profiles (id) on delete set null
);
create unique index business_suspensions_open_idx on public.business_suspensions (business_id) where lifted_at is null;
create index business_suspensions_business_idx on public.business_suspensions (business_id, created_at desc);

create table public.freeze_requests (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  reason      text not null check (length(trim(reason)) between 3 and 500),
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note  text not null default '' check (length(admin_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create unique index freeze_requests_pending_idx on public.freeze_requests (business_id) where status = 'pending';
create index freeze_requests_business_idx on public.freeze_requests (business_id, created_at desc);

-- Şu an askıda olanlara geçmiş kaydı: başlangıcı bilinmediği için abonelik süresi eklenmez.
insert into public.business_suspensions (business_id, reason, note)
select id, 'diger', 'Detaylı askıdan önce askıya alındı.' from public.businesses where is_suspended;

alter table public.business_suspensions enable row level security;
alter table public.freeze_requests      enable row level security;
create policy "askı: sahibi okur" on public.business_suspensions
  for select using (public.is_business_owner(business_id));
create policy "admin: askıları okur" on public.business_suspensions
  for select using ((select public.is_admin()));
create policy "dondurma talebi: sahibi okur" on public.freeze_requests
  for select using (public.is_business_owner(business_id));
create policy "admin: dondurma taleplerini okur" on public.freeze_requests
  for select using ((select public.is_admin()));

drop policy if exists "işletme: sahibi siler" on public.businesses;

create or replace function public.lift_suspension(p_business_id uuid, p_by uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s public.business_suspensions;
begin
  update public.business_suspensions set lifted_at = now(), lifted_by = p_by
  where business_id = p_business_id and lifted_at is null
  returning * into s;
  update public.businesses b
  set is_suspended = false,
      subscription_ends_at = case when s.pause_subscription then b.subscription_ends_at + (now() - s.created_at) else b.subscription_ends_at end,
      -- Denemedeki işletme denemede kalsın (subscription_ends_at = trial_ends_at).
      trial_ends_at = case when s.pause_subscription and b.subscription_ends_at = b.trial_ends_at
                           then b.trial_ends_at + (now() - s.created_at) else b.trial_ends_at end
  where b.id = p_business_id;
end;
$$;

create or replace function public.lift_due_suspensions()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select business_id from public.business_suspensions where lifted_at is null and until <= now()
  loop
    perform public.lift_suspension(v_id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.lift_suspension(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.lift_due_suspensions() from public, anon, authenticated;

create or replace function public.admin_end_subscription(p_business_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  update public.businesses set subscription_ends_at = now()
  where id = p_business_id and subscription_ends_at > now();
  -- Bitirilen abonelik askı kalkınca geri uzamasın.
  update public.business_suspensions set pause_subscription = false
  where business_id = p_business_id and lifted_at is null;
end;
$$;

create or replace function public.admin_suspend_business(
  p_business_id         uuid,
  p_reason              text,
  p_note                text default '',
  p_until               timestamptz default null,
  p_cancel_appointments boolean default false,
  p_request_id          uuid default null
)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b       public.businesses;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if b.is_suspended then raise exception 'İşletme zaten askıda.'; end if;
  if p_reason is null or p_reason not in ('kural_ihlali', 'odeme', 'sikayet', 'sahip_talebi', 'diger') then
    raise exception 'Askı sebebini seçin.';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'Not en fazla 500 karakter olabilir.'; end if;
  if p_until is not null and p_until <= now() then raise exception 'Bitiş tarihi ileride olmalı.'; end if;

  if p_request_id is not null then
    update public.freeze_requests set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_request_id and business_id = p_business_id and status = 'pending';
    if not found then raise exception 'Bu talep artık açık değil.'; end if;
  end if;

  -- Önce askı: iptaller bekleme listesine "yer açıldı" haberi göndermesin (waitlist_on_free_slot).
  update public.businesses set is_suspended = true where id = p_business_id;
  if p_cancel_appointments then
    update public.appointments
    set status = 'cancelled', cancel_reason = 'İşletme şu an hizmet vermiyor. Yeni randevu için daha sonra tekrar deneyin.'
    where business_id = p_business_id and status in ('pending', 'confirmed') and starts_at > now();
    get diagnostics v_count = row_count;
  end if;

  insert into public.business_suspensions (business_id, reason, note, until, appointments_cancelled, pause_subscription, created_by)
  values (p_business_id, p_reason, trim(coalesce(p_note, '')), p_until, v_count,
          coalesce(b.subscription_ends_at > now(), false), auth.uid());
  return v_count;
end;
$$;

create or replace function public.admin_lift_suspension(p_business_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id and is_suspended) then
    raise exception 'İşletme askıda değil.';
  end if;
  perform public.lift_suspension(p_business_id, auth.uid());
end;
$$;

create or replace function public.admin_set_suspended(p_business_id uuid, p_suspended boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_current boolean;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select is_suspended into v_current from public.businesses where id = p_business_id;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if v_current = p_suspended then return; end if;
  if p_suspended then
    perform public.admin_suspend_business(p_business_id, 'diger');
  else
    perform public.admin_lift_suspension(p_business_id);
  end if;
end;
$$;

create or replace function public.request_freeze(p_reason text, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b    public.businesses;
  v_id uuid;
begin
  select * into b from public.businesses where owner_id = auth.uid();
  if not found or b.approval_status <> 'approved' then raise exception 'Talep için onaylı bir işletmeniz olmalı.'; end if;
  if b.is_suspended then raise exception 'İşletmeniz zaten askıda.'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Sebep 3 ile 500 karakter arasında olmalı.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_starts_on < (now() at time zone b.timezone)::date then
    raise exception 'Geçerli bir tarih aralığı seçin.';
  end if;
  if exists (select 1 from public.freeze_requests where business_id = b.id and status = 'pending') then
    raise exception 'Açık bir talebiniz var.';
  end if;
  insert into public.freeze_requests (business_id, reason, starts_on, ends_on)
  values (b.id, trim(p_reason), p_starts_on, p_ends_on)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_reject_freeze_request(p_id uuid, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if length(trim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'Ret sebebini yazın.';
  end if;
  update public.freeze_requests
  set status = 'rejected', admin_note = trim(p_note), reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_id and status = 'pending';
  if not found then raise exception 'Bu talep artık açık değil.'; end if;
end;
$$;

-- Yöneticinin iptali işletme adına sayılır: haber müşteriye gider. Aşağıdaki iki gövde schema.sql ile aynı.
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
    -- İptal edene değil, karşı tarafa haber verilir. Yöneticinin iptali de işletme adına sayılır (askı).
    v_to := case when v_by_owner or new.cancelled_by = 'business' then 'customer' else 'business' end;
  elsif old.status in ('pending', 'confirmed') and new.status in ('pending', 'confirmed')
        and new.starts_at <> old.starts_at then
    v_kind := 'rescheduled';
    v_to := case when v_by_owner then 'customer' else 'business' end;
    -- Her saat değişikliği yeniden bildirilir; hatırlatma ve onay yeni saat için tekrar gidebilir.
    delete from public.notifications
    where appointment_id = new.id and kind in ('rescheduled', 'reminder', 'reminder_soon', 'confirmed');
    delete from public.inbox
    where appointment_id = new.id and kind in ('rescheduled', 'reminder', 'confirmed');
    delete from public.appointment_reminders where appointment_id = new.id;
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

create or replace function public.waitlist_on_free_slot()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status in ('pending', 'confirmed') and old.starts_at > now()
     and (new.status = 'cancelled' or new.starts_at <> old.starts_at or new.staff_id is distinct from old.staff_id) then
    update public.waitlist w
    set notify_status = 'pending'
    from public.businesses b
    where b.id = old.business_id
      and not b.is_suspended
      and w.business_id = old.business_id
      and w.day = (old.starts_at at time zone b.timezone)::date
      and w.customer_id is distinct from old.customer_id
      and (w.notified_at is null or w.notified_at < now() - interval '30 minutes');
  end if;
  return new;
end;
$$;

commit;
