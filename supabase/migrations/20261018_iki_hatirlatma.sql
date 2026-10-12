-- =====================================================================
-- İki hatırlatma: randevudan 1 gün ve 2 saat önce (önceden tek hatırlatma vardı).
-- 20261017_sahte_randevu.sql'den SONRA çalıştırın. ÖNCE web'i yayınlayın: yeni "reminder_soon"
-- e-postasını eski web sürümü tanımaz.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor. Veri silmez.
-- =====================================================================

begin;

-- Gönderilen hatırlatma aşamaları (1 = bir gün önce, 2 = iki saat önce); queue_due_reminders yazar.
-- Randevunun saati değişince silinir, hatırlatmalar yeni saat için tekrar gider.
create table public.appointment_reminders (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  stage          smallint not null check (stage in (1, 2)),
  sent_at        timestamptz not null default now(),
  primary key (appointment_id, stage)
);

alter table public.appointment_reminders enable row level security;

-- Hatırlatması zaten gitmiş randevular tekrar hatırlatılmasın (eski sistemde 24 saatten önce alınana
-- 1 gün kala, daha geç alınana 2 saat kala gidiyordu).
insert into public.appointment_reminders (appointment_id, stage)
select a.id, case when a.created_at <= a.starts_at - interval '24 hours' then 1 else 2 end
from public.appointments a
where a.starts_at > now()
  and (exists (select 1 from public.notifications n where n.appointment_id = a.id and n.kind = 'reminder')
       or exists (select 1 from public.inbox i where i.appointment_id = a.id and i.kind = 'reminder'))
on conflict do nothing;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'reminder_soon', 'review'));

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

drop function public.queue_due_reminders();
-- Onaylı randevuya iki hatırlatma (e-posta ve uygulama içi): 1 gün önce (en az 24 saat önceden alınan
-- randevuya) ve 2 saat önce (en az 3 saat önceden alınana). 2 saat kalmışsa 1 günlük artık gönderilmez.
-- Uygulamada tek "yaklaşıyor" bildirimi tutulur; 2 saat kala silinip yeniden eklenir, böylece yeni push gider
-- (eski uygulama sürümleri yeni bildirim türlerini tanımaz). Eklenen bildirim sayısını döner.
create function public.queue_due_reminders()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a       public.appointments;
  v_stage smallint;
  v_n     int := 0;
  v_i     int;
begin
  for a in
    select * from public.appointments ap
    where ap.status = 'confirmed'
      and (ap.customer_email is not null or ap.customer_id is not null)
      and ap.starts_at > now()
      and ap.starts_at <= now() + interval '24 hours'
      and ap.created_at <= ap.starts_at - interval '3 hours'
  loop
    v_stage := case
      when a.starts_at <= now() + interval '2 hours' then 2
      when a.created_at <= a.starts_at - interval '24 hours' then 1
    end;
    continue when v_stage is null;
    insert into public.appointment_reminders (appointment_id, stage) values (a.id, v_stage)
    on conflict do nothing;
    get diagnostics v_i = row_count;
    continue when v_i = 0;

    if a.customer_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (a.id, case when v_stage = 1 then 'reminder' else 'reminder_soon' end, 'customer', a.customer_email)
      on conflict do nothing;
      get diagnostics v_i = row_count;
      v_n := v_n + v_i;
    end if;
    if a.customer_id is not null then
      delete from public.inbox where appointment_id = a.id and kind = 'reminder' and recipient = 'customer';
      v_n := v_n + public.inbox_insert(a.customer_id, 'reminder', 'customer', a);
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.queue_due_reminders() from public, anon, authenticated;

commit;
