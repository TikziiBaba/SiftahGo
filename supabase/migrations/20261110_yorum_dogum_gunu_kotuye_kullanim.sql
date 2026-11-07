-- =====================================================================
-- Güvenlik: değerlendirme ve doğum günü kuponu kötüye kullanımı.
-- - add_review: işletme sahibi kendi işletmesini değerlendiremez; saati başlamamış randevu "Tamamlandı" işaretlense
--   de değerlendirme randevu saati gelince açılır (ikinci hesapla randevu alıp hemen puan yazmak kapanır).
-- - claim_birthday_gifts: favori yetmez, işletmede gerçekleşmiş randevu gerekir; bir işletmeden bir müşteriye
--   300 günde en fazla bir doğum günü kuponu (doğum gününü değiştirip ikinci kupon alınamaz).
-- 20261109_kasa_hatirlatma_dogum_gunu.sql'den SONRA çalıştırın. Web yayını beklemez.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

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
  if exists (select 1 from public.businesses b where b.id = a.business_id and b.owner_id = auth.uid()) then
    raise exception 'Kendi işletmenizi değerlendiremezsiniz.';
  end if;
  if a.starts_at > now() then
    raise exception 'Randevu saatiniz geldikten sonra değerlendirebilirsiniz.';
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

create or replace function public.claim_birthday_gifts(p_limit int default 50)
returns table (
  id             uuid,
  email          text,
  customer_name  text,
  business_name  text,
  business_slug  text,
  discount_type  text,
  discount_value numeric,
  ends_on        date,
  tokens         text[]
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r       record;
  v_cid   uuid;
  v_code  text;
  v_try   int;
  v_n     int := 0;
  v_title text;
begin
  for r in
    select b.id business_id, b.name, b.slug, b.birthday_discount_type, b.birthday_discount_value, p.id customer_id,
           p.full_name, t.today, public.next_birthday(p.birth_month, p.birth_day, t.today) bday
    from public.businesses b
    cross join lateral (select (now() at time zone b.timezone)::date today) t
    join public.profiles p on p.birth_month is not null
    where b.birthday_discount_type is not null
      and public.is_bookable(b.id)
      and public.plan_has_feature(b.id, 'coupons')
      and public.next_birthday(p.birth_month, p.birth_day, t.today) - t.today <= 3
      and exists (select 1 from public.appointments a
                  where a.business_id = b.id and a.customer_id = p.id and a.starts_at > now() - interval '2 years'
                    and a.starts_at <= now()
                    and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now())))
      and not exists (select 1 from public.blocked_customers k where k.business_id = b.id and k.customer_id = p.id)
      and not exists (
        select 1 from public.birthday_gifts g
        where g.business_id = b.id and g.customer_id = p.id
          and (g.year = extract(year from public.next_birthday(p.birth_month, p.birth_day, t.today))::int
               or g.created_at > now() - interval '300 days')
      )
    limit p_limit
  loop
    v_title := 'Doğum gününüz kutlu olsun';
    insert into public.coupons (business_id, title, discount_type, discount_value, starts_on, ends_on, total_limit,
                                is_active, is_birthday, claimed_count)
    values (r.business_id, v_title, r.birthday_discount_type, r.birthday_discount_value, r.today, r.bday + 7, 1,
            false, true, 1)
    returning coupons.id into v_cid;
    v_try := 0;
    loop
      v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.coupon_claims cl where cl.business_id = r.business_id and cl.code = v_code);
      v_try := v_try + 1;
      if v_try > 50 then raise exception 'Kod oluşturulamadı.'; end if;
    end loop;
    insert into public.coupon_claims (coupon_id, business_id, customer_id, code)
    values (v_cid, r.business_id, r.customer_id, v_code);
    insert into public.birthday_gifts (business_id, customer_id, year, coupon_id)
    values (r.business_id, r.customer_id, extract(year from r.bday)::int, v_cid);

    id := v_cid;
    select u.email::text into email from auth.users u where u.id = r.customer_id;
    customer_name := r.full_name;
    business_name := r.name;
    business_slug := r.slug;
    discount_type := r.birthday_discount_type;
    discount_value := r.birthday_discount_value;
    ends_on := r.bday + 7;
    tokens := coalesce((select array_agg(pt.token) from public.push_tokens pt where pt.user_id = r.customer_id), '{}');
    return next;
  end loop;
end;
$$;

commit;
