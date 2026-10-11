-- =====================================================================
-- Yorumlar (geçmiş randevu değerlendirme, "hizmet nasıldı?", işletme cevabı) ve
-- sık iptal eden müşteri uyarısı. 20261012_deneme_erteleme.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor. Veri silmez.
-- Eski iptallerde iptal edenin kim olduğu bilinmediği için sayım bugünden itibaren işler.
-- =====================================================================

begin;

alter table public.appointments
  add column cancelled_by text check (cancelled_by in ('customer', 'business')),
  add column prior_cancels int not null default 0,
  add column prior_no_shows int not null default 0,
  add column customer_flagged boolean not null default false;
create index appointments_phone_idx on public.appointments ((right(regexp_replace(customer_phone, '\D', '', 'g'), 10)));

alter table public.reviews
  add column reply text not null default '' check (length(reply) <= 1000),
  add column replied_at timestamptz;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'review'));
alter table public.inbox drop constraint inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('booked', 'confirmed', 'cancelled', 'rescheduled', 'reminder', 'review', 'reviewed'));

-- Sık iptal eden müşteri
-- Müşterinin son 6 aydaki iptal (kendi iptal ettiği) ve gelmediği randevu sayısı; tüm işletmelerde.
-- Hesapla veya telefon numarasının son 10 hanesiyle eşleşir.
create function public.customer_history(p_customer uuid, p_phone text, out cancels int, out no_shows int)
language sql stable security definer set search_path = ''
as $$
  select
    (count(*) filter (where a.status = 'cancelled' and a.cancelled_by = 'customer'))::int,
    (count(*) filter (where a.status = 'no_show'))::int
  from public.appointments a
  where a.starts_at > now() - interval '180 days'
    and (
      (p_customer is not null and a.customer_id = p_customer)
      or (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
          and right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10))
    );
$$;

revoke execute on function public.customer_history(uuid, text) from public, anon, authenticated;

-- Randevu yazılırken: geçmiş sayıları ve "sık iptal eden müşteri" işareti (yalnız eklerken),
-- iptal edenin kim olduğu (durum iptale dönünce). İstemci bu alanları elle değiştiremez.
create function public.appointments_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner boolean := public.is_business_owner(new.business_id);
begin
  if tg_op = 'INSERT' then
    select h.cancels, h.no_shows into new.prior_cancels, new.prior_no_shows
    from public.customer_history(new.customer_id, new.customer_phone) h;
    -- Son 6 ayda 3 iptal veya 2 gelmeme: işletme uyarılır, müşterinin aldığı randevu onaya düşer.
    new.customer_flagged := new.prior_cancels >= 3 or new.prior_no_shows >= 2;
    if new.customer_flagged and not v_owner and new.status = 'confirmed' then
      new.status := 'pending';
    end if;
    new.cancelled_by := case when new.status = 'cancelled' then 'business' end;
  else
    new.prior_cancels := old.prior_cancels;
    new.prior_no_shows := old.prior_no_shows;
    new.customer_flagged := old.customer_flagged;
    new.cancelled_by := case
      when new.status <> 'cancelled' then null
      when old.status = 'cancelled' then old.cancelled_by
      when not v_owner and new.customer_id = auth.uid() then 'customer'
      else 'business'
    end;
  end if;
  return new;
end;
$$;

create trigger appointments_before_write
  before insert or update on public.appointments
  for each row execute function public.appointments_before_write();

drop function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text);
-- Müşteri (girişli veya misafir) randevu alır. p_staff_id boşsa uygun ilk personel.
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
  v_staff  uuid;
  v_id     uuid;
  v_status text;
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
begin
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Lütfen adınızı girin.';
  end if;
  if length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Lütfen geçerli bir e-posta adresi girin.';
  end if;
  if v_email is null then
    select u.email into v_email from auth.users u where u.id = auth.uid();
  end if;

  select * into b from public.businesses where id = p_business_id and public.is_bookable(id);
  if not found then raise exception 'Bu işletme şu an online randevu almıyor.'; end if;

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
    b.id, s.id, v_staff, auth.uid(), s.name,
    trim(p_customer_name), trim(p_customer_phone), v_email, left(coalesce(p_note, ''), 500), s.price,
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

-- Yorumlar
-- Müşteri gerçekleşen randevusunu değerlendirir: tamamlanan veya saati geçmiş onaylı randevu
-- (işletme "Tamamlandı" işaretlemese de). İptal ve gelmedi değerlendirilemez.
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
    and (status = 'completed' or (status = 'confirmed' and ends_at <= now()));
  if not found then
    raise exception 'Sadece tamamlanan randevularınızı değerlendirebilirsiniz.';
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

-- İşletme sahibi değerlendirmeye herkese açık cevap yazar; boş cevap cevabı kaldırır.
create function public.reply_review(p_id uuid, p_reply text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reply text := left(trim(coalesce(p_reply, '')), 1000);
begin
  update public.reviews r
  set reply = v_reply, replied_at = case when v_reply = '' then null else now() end
  where r.id = p_id and public.is_business_owner(r.business_id);
  if not found then raise exception 'Bu değerlendirmeye cevap veremezsiniz.'; end if;
end;
$$;

-- Randevu bittikten 2 saat sonra girişli müşteriye "Hizmet nasıldı?" (e-posta ve uygulama içi) gider.
-- Değerlendirilmiş, iptal edilmiş, gelinmemiş ya da 3 günden eski randevuya gitmez. Eklenen sayıyı döner.
create function public.queue_review_requests()
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
    where ap.customer_id is not null
      and ap.status in ('confirmed', 'completed')
      and ap.ends_at <= now() - interval '2 hours'
      and ap.ends_at > now() - interval '3 days'
      and not exists (select 1 from public.reviews r where r.appointment_id = ap.id)
  loop
    if a.customer_email is not null then
      insert into public.notifications (appointment_id, kind, recipient, email)
      values (a.id, 'review', 'customer', a.customer_email)
      on conflict do nothing;
      get diagnostics v_i = row_count;
      v_n := v_n + v_i;
    end if;
    v_n := v_n + public.inbox_insert(a.customer_id, 'review', 'customer', a);
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.queue_review_requests() from public, anon, authenticated;

-- Yeni değerlendirme işletme sahibine uygulama içi bildirim (ve push) olarak gider.
create function public.review_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_owner uuid;
begin
  select * into a from public.appointments where id = new.appointment_id;
  select owner_id into v_owner from public.businesses where id = new.business_id;
  perform public.inbox_insert(v_owner, 'reviewed', 'business', a);
  return null;
end;
$$;

create trigger reviews_notify_business
  after insert on public.reviews
  for each row execute function public.review_after_insert();

-- Bildirimler
-- Uygulama içi bildirim ekler; eklendiyse 1 döner.
create or replace function public.inbox_insert(p_user uuid, p_kind text, p_recipient text, a public.appointments)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business text;
  v_when     text;
  v_title    text;
  v_body     text;
  v_flagged  boolean := p_recipient = 'business' and p_kind = 'booked' and a.customer_flagged;
  r          public.reviews;
  v_n        int;
begin
  select b.name, public.format_when(a.starts_at, b.timezone) into v_business, v_when
  from public.businesses b where b.id = a.business_id;
  if p_kind = 'reviewed' then
    select * into r from public.reviews where appointment_id = a.id;
  end if;

  v_title := case
    when p_kind = 'reviewed' then 'Yeni değerlendirme: ' || repeat('★', r.rating) || repeat('☆', 5 - r.rating)
    when p_kind = 'review' then 'Hizmet nasıldı?'
    when v_flagged then 'Dikkat: sık iptal eden müşteri'
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

  v_body := case
    when p_kind = 'reviewed' then concat_ws(' · ', r.customer_name, a.service_name, nullif(left(r.comment, 120), ''))
    when p_kind = 'review' then concat_ws(' · ', v_business, a.service_name, 'Puan vermek için dokunun')
    else concat_ws(' · ', case when p_recipient = 'business' then a.customer_name else v_business end,
                   a.service_name, v_when,
                   case when v_flagged then format('Son 6 ayda %s iptal, %s gelmedi', a.prior_cancels, a.prior_no_shows) end,
                   case when v_flagged and a.status = 'pending' then 'Onayınızı bekliyor' end)
  end;

  insert into public.inbox (user_id, appointment_id, kind, recipient, title, body)
  values (p_user, a.id, p_kind, p_recipient, v_title, v_body)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

drop function public.claim_notifications(int);
-- Gönderilecek e-postaları randevu ve işletme bilgileriyle birlikte alır.
-- Alınan kayıt 5 dakika kilitlenir; aynı anda çalışan ikinci istek onu almaz.
create function public.claim_notifications(p_limit int default 20)
returns table (
  id               uuid,
  kind             text,
  recipient        text,
  email            text,
  customer_name    text,
  customer_phone   text,
  service_name     text,
  note             text,
  price            numeric,
  starts_at        timestamptz,
  status           text,
  business_name    text,
  business_slug    text,
  business_phone   text,
  business_address text,
  prior_cancels    int,
  prior_no_shows   int,
  customer_flagged boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Artık anlamı kalmayanlar: başlamış randevu, iptal edilen randevunun onayı/hatırlatması;
  -- "hizmet nasıldı?" için değerlendirilmiş, iptal edilmiş veya gelinmemiş randevu.
  update public.notifications n
  set status = 'skipped'
  from public.appointments a
  where a.id = n.appointment_id
    and n.status = 'pending'
    and case
          when n.kind = 'review' then a.status not in ('confirmed', 'completed')
                                   or exists (select 1 from public.reviews r where r.appointment_id = a.id)
          else a.starts_at <= now() or (n.kind <> 'cancelled' and a.status not in ('pending', 'confirmed'))
        end;

  return query
  with picked as (
    select n.id from public.notifications n
    where n.status = 'pending' and (n.locked_until is null or n.locked_until < now())
    order by n.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notifications n
    set locked_until = now() + interval '5 minutes', attempts = n.attempts + 1
    from picked
    where n.id = picked.id
    returning n.*
  )
  select
    c.id, c.kind, c.recipient, c.email,
    a.customer_name, a.customer_phone, a.service_name, a.note, a.price, a.starts_at, a.status,
    b.name, b.slug, b.phone,
    concat_ws(', ', nullif(b.address, ''), nullif(b.district, ''), nullif(b.city, '')),
    a.prior_cancels, a.prior_no_shows, a.customer_flagged
  from claimed c
  join public.appointments a on a.id = c.appointment_id
  join public.businesses b on b.id = a.business_id
  order by c.created_at;
end;
$$;

revoke execute on function public.claim_notifications(int) from public, anon, authenticated;

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
    and (not exists (select 1 from public.push_tokens t where t.user_id = i.user_id)
         or case
              when i.kind = 'reviewed' then false
              when i.kind = 'review' then a.status not in ('confirmed', 'completed')
                                       or exists (select 1 from public.reviews r where r.appointment_id = a.id)
              else a.starts_at <= now() or (i.kind <> 'cancelled' and a.status not in ('pending', 'confirmed'))
            end);

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

commit;
