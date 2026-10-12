-- =====================================================================
-- WhatsApp ile telefon doğrulaması kaldırılır (sistem WhatsApp'tan mesaj almaz; esnaf isterse
-- müşterisine kendi WhatsApp'ından yazar). Giriş zorunluluğu, sınırlar ve engelleme kalır.
-- 20261018_iki_hatirlatma.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

drop function public.start_phone_verification();
drop function public.confirm_phone_verification(text, text);

drop function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text);
-- Girişli müşteri randevu alır. p_staff_id boşsa uygun ilk personel.
-- Sahte randevuya karşı: işletmenin engellediği müşteri alamaz; aynı işletmede en fazla 3, toplamda
-- en fazla 10 yaklaşan randevu; 24 saatte en fazla 10 randevu.
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
  v_uid    uuid := auth.uid();
  v_staff  uuid;
  v_id     uuid;
  v_status text;
  v_phone  text := trim(coalesce(p_customer_phone, ''));
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
begin
  if v_uid is null then
    raise exception 'Randevu almak için giriş yapın.';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Lütfen adınızı girin.';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then
    raise exception 'Lütfen geçerli bir telefon numarası girin.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Lütfen geçerli bir e-posta adresi girin.';
  end if;
  if v_email is null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;

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

  return jsonb_build_object('id', v_id, 'status', v_status);
exception
  when exclusion_violation then
    raise exception 'Bu saat artık müsait değil, lütfen başka bir saat seçin.';
end;
$$;

drop table public.phone_verifications;
drop table public.app_settings;

commit;
