-- =====================================================================
-- Randevu onayı:
-- - Üç onay modu: hepsini otomatik / yalnızca tanıdık müşteriyi otomatik (bu işletmede tamamlanmış randevusu olan),
--   ilk kez geleni elle / hepsini elle (auto_confirm + auto_confirm_known_only, needs_confirmation).
-- - Ret ve iptal sebebi: işletmenin yazdığı açıklama müşteriye e-posta ve uygulama bildirimiyle gider; onay bekleyen
--   randevu reddedilince müşteriye "Randevu talebiniz onaylanmadı" denir (cancel_reason, rejected).
-- - Müşteri kartı: işletme gelen randevunun müşterisinin geçmişini ve yazdığı yorumları görür (customer_card).
-- 20261026_isletme_onayi.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

alter table public.businesses add column auto_confirm_known_only boolean not null default false;
alter table public.appointments
  add column cancel_reason text not null default '' check (length(cancel_reason) <= 300),
  add column rejected      boolean not null default false;

-- Randevu yazılırken: geçmiş sayıları ve "sık iptal eden müşteri" işareti (yalnız eklerken),
-- iptal edenin kim olduğu (durum iptale dönünce). İstemci bu alanları elle değiştiremez.
create or replace function public.appointments_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner boolean := public.is_business_owner(new.business_id);
begin
  if tg_op = 'INSERT' then
    select h.cancels, h.no_shows into new.prior_cancels, new.prior_no_shows
    from public.customer_history(new.customer_id, new.customer_phone, new.business_id) h;
    -- Son 6 ayda 3 iptal veya 2 gelmeme: işletme uyarılır, müşterinin aldığı randevu onaya düşer.
    new.customer_flagged := new.prior_cancels >= 3 or new.prior_no_shows >= 2;
    if new.customer_flagged and not v_owner and new.status = 'confirmed' then
      new.status := 'pending';
    end if;
    new.cancelled_by := case when new.status = 'cancelled' then 'business' end;
    new.rejected := false;
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
    new.rejected := new.status = 'cancelled' and new.cancelled_by = 'business'
                    and (old.status = 'pending' or (old.status = 'cancelled' and old.rejected));
  end if;
  -- Açıklamayı yalnızca iptal eden işletme yazar.
  new.cancel_reason := case when new.cancelled_by = 'business' then trim(new.cancel_reason) else '' end;
  return new;
end;
$$;

-- Müşterinin randevusu (veya saat değişikliği) işletme onayına düşer mü: elle onayda her zaman; "yalnızca tanıdık
-- müşteriyi otomatik onayla" seçiliyse bu işletmede daha önce tamamlanmış randevusu olmayanda. Sık iptal eden
-- müşteri ayrıca appointments_before_write'ta onaya düşer. İstemciye kapalı (müşterinin ziyaretlerini açığa çıkarır).
create or replace function public.needs_confirmation(p_business public.businesses, p_customer uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select not p_business.auto_confirm
    or (p_business.auto_confirm_known_only and not exists (
      select 1 from public.appointments a
      where a.business_id = p_business.id and a.customer_id = p_customer and a.status = 'completed'
    ));
$$;

-- Girişli müşteri randevu alır. p_staff_id boşsa uygun ilk personel.
-- Sahte randevuya karşı: işletmenin engellediği müşteri alamaz; aynı işletmede en fazla 3, toplamda
-- en fazla 10 yaklaşan randevu; 24 saatte en fazla 10 randevu.
-- Dönen: {id, status}. İşletme elle onaylıyorsa, yalnızca tanıdık müşteriyi otomatik onaylıyorsa ve müşteri ilk kez
-- geliyorsa ya da müşteri sık iptal ediyorsa randevu işletme onayına düşer (status = pending).
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
    case when public.needs_confirmation(b, v_uid) then 'pending' else 'confirmed' end
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

-- Gelecekteki randevunun saatini değiştirir: müşterisi (girişli) veya işletme sahibi.
-- Yeni saat boş saatlerden olmalı. p_staff_id boşsa uygun ilk personel.
-- Müşteri değiştirdiyse ve randevusu onaya düşecek bir müşteriyse (needs_confirmation) randevu yeniden onay bekler.
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
      status = case when not v_owner and public.needs_confirmation(b, a.customer_id) then 'pending' else a.status end
  where id = a.id;
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
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
    when p_kind = 'cancelled' and a.rejected then 'Randevu talebiniz onaylanmadı'
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
                   case when v_flagged and a.status = 'pending' then 'Onayınızı bekliyor' end,
                   case when p_kind = 'cancelled' and p_recipient = 'customer' then nullif(a.cancel_reason, '') end)
  end;

  insert into public.inbox (user_id, appointment_id, kind, recipient, title, body)
  values (p_user, a.id, p_kind, p_recipient, v_title, v_body)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- İşletmenin gelen randevuyu değerlendirmesi için müşteri kartı: üyelik tarihi, bu işletmedeki ve tüm SiftahGo'daki
-- geçmişi, müşterinin işletmelere yazdığı yorumlar (son 10). Yalnızca randevunun işletme sahibi görür. Elle eklenen
-- (hesapsız) randevuda yalnızca bu işletmedeki telefon geçmişi döner: telefon doğrulanmadığı için başka işletmelerle
-- eşleştirilmez (customer_history ile aynı kural).
create or replace function public.customer_card(p_appointment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a     public.appointments;
  v_key text;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found or not public.is_business_owner(a.business_id) then
    raise exception 'Randevu bulunamadı.';
  end if;
  v_key := right(regexp_replace(a.customer_phone, '\D', '', 'g'), 10);

  return jsonb_build_object(
    'member_since', (select p.created_at from public.profiles p where p.id = a.customer_id),
    'here', (
      select jsonb_build_object(
        'completed', count(*) filter (where x.status = 'completed'),
        'cancelled', count(*) filter (where x.status = 'cancelled' and x.cancelled_by = 'customer'),
        'no_show', count(*) filter (where x.status = 'no_show'),
        'last_visit', max(x.starts_at) filter (where x.status = 'completed')
      )
      from public.appointments x
      where x.business_id = a.business_id and x.id <> a.id
        and case
              when a.customer_id is not null then x.customer_id = a.customer_id
              else x.customer_id is null and length(v_key) = 10
                   and right(regexp_replace(x.customer_phone, '\D', '', 'g'), 10) = v_key
            end
    ),
    'platform', case when a.customer_id is not null then (
      select jsonb_build_object(
        'completed', count(*) filter (where x.status = 'completed'),
        'cancelled', count(*) filter (where x.status = 'cancelled' and x.cancelled_by = 'customer'),
        'no_show', count(*) filter (where x.status = 'no_show'),
        'businesses', count(distinct x.business_id) filter (where x.status = 'completed')
      )
      from public.appointments x
      where x.customer_id = a.customer_id and x.id <> a.id
    ) end,
    'reviews', case when a.customer_id is not null then (
      select jsonb_build_object(
        'count', count(*),
        'avg', round(avg(r.rating), 1),
        'latest', coalesce((
          select jsonb_agg(jsonb_build_object(
            'business', b.name, 'rating', l.rating, 'comment', l.comment, 'created_at', l.created_at
          ) order by l.created_at desc)
          from (
            select * from public.reviews r2 where r2.customer_id = a.customer_id order by r2.created_at desc limit 10
          ) l
          join public.businesses b on b.id = l.business_id
        ), '[]')
      )
      from public.reviews r
      where r.customer_id = a.customer_id
    ) end
  );
end;
$$;

-- Dönüş tipine iki sütun eklendi (cancel_reason, rejected); tip değişikliği için önce silinir.
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
  customer_flagged boolean,
  cancel_reason    text,
  rejected         boolean
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
    a.prior_cancels, a.prior_no_shows, a.customer_flagged, a.cancel_reason, a.rejected
  from claimed c
  join public.appointments a on a.id = c.appointment_id
  join public.businesses b on b.id = a.business_id
  order by c.created_at;
end;
$$;

revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.needs_confirmation(public.businesses, uuid) from public, anon, authenticated;

commit;
