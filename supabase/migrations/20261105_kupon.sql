-- =====================================================================
-- Kupon (2026-11-05):
-- - Esnaf kupon tanımlar (yüzde ya da sabit indirim, tarih aralığı, gün-saat, toplam sınır, hizmetler);
--   müşteri kuponu alır (hesabına özel 6 haneli kod), esnaf kodu kasada kullanılmış sayar (geri alma 10 dakika).
-- - Özellik adı 'coupons': Esnaf ve Pro paketlerine eklenir. Bütün yazmalar RPC üzerinden; tablolarda yazma politikası yok.
-- 20261104_gecikme.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

update public.plans set features = features || '{coupons}' where id in ('esnaf', 'pro') and not ('coupons' = any (features));

-- Kupon tanımı (save_coupon yazar). weekdays working_hours ile aynı: 1 = Pazartesi, 7 = Pazar; boş = her gün.
-- Saatler işletmenin timezone değerine göre; start_time/end_time ikisi birlikte dolu ya da boş. service_ids boş = tüm hizmetler.
-- İlk alımdan sonra indirim, gün-saat ve hizmetler kilitlenir (save_coupon). claimed_count alınan kupon sayısıdır;
-- toplam sınır buna karşı sayılır, kullanılmayan kupon sınırdan yer açmaz.
create table public.coupons (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  title          text not null check (length(trim(title)) between 1 and 80),
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  starts_on      date not null,
  ends_on        date not null,
  weekdays       int[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  start_time     time,
  end_time       time,
  total_limit    int check (total_limit >= 1),
  service_ids    uuid[] not null default '{}',
  is_active      boolean not null default true,
  claimed_count  int not null default 0 check (claimed_count >= 0),
  created_at     timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value between 1 and 90),
  check (ends_on >= starts_on and ends_on - starts_on < 90),
  check ((start_time is null) = (end_time is null) and (start_time is null or start_time < end_time))
);
create index coupons_business_idx on public.coupons (business_id);

-- Müşterinin aldığı kupon ve hesabına özel 6 haneli kodu (claim_coupon yazar). Hesap silinirse customer_id boşalır:
-- rapor sayıları değişmez, kod kullanılamaz. redeemed_at: kasada kullanıldı (redeem_coupon_code). appointment_id:
-- kuponun uygulandığı randevu; kullanılmışlık randevudan hesaplanır (coupon_claim_used), iptal/gelmeme kuponu geri verir.
create table public.coupon_claims (
  id             uuid primary key default gen_random_uuid(),
  coupon_id      uuid not null references public.coupons (id) on delete cascade,
  business_id    uuid not null references public.businesses (id) on delete cascade,
  customer_id    uuid references public.profiles (id) on delete set null,
  code           text not null check (code ~ '^[0-9]{6}$'),
  redeemed_at    timestamptz,
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (coupon_id, customer_id),
  unique (business_id, code)
);
create index coupon_claims_customer_idx on public.coupon_claims (customer_id);
create index coupon_claims_appointment_idx on public.coupon_claims (appointment_id);

-- Kasada yanlış girilen kodlar: işletme başına 10 dakikada 20 yanlış denemeden sonra giriş durur
-- (coupon_lookup yazar; hata fırlatılsa kayıt geri alınacağı için yanlış kod hata değil boş sonuç döner).
create table public.coupon_code_attempts (
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index coupon_code_attempts_idx on public.coupon_code_attempts (business_id, created_at);

-- ---------------------------------------------------------------------
-- Kupon. Bütün yazmalar bu fonksiyonlarla yapılır; tablolarda yazma politikası yoktur.
-- ---------------------------------------------------------------------
-- İndirimli fiyat: yüzde kuruşa yuvarlanır, sabit indirim fiyatı aşarsa 0.
create function public.coupon_price(p_price numeric, p_type text, p_value numeric)
returns numeric
language sql immutable set search_path = ''
as $$
  select case p_type
    when 'percent' then round(p_price * (100 - p_value) / 100, 2)
    else greatest(round(p_price - p_value, 2), 0)
  end;
$$;

-- Kupon p_at anında geçerli değilse sebebi, geçerliyse null (tarih aralığı, gün ve saat; işletmenin saatine göre).
-- Kuponun etkin olup olmamasına bakmaz: durdurma önceden alınmış kodları bozmaz.
create function public.coupon_invalid_reason(c public.coupons, p_at timestamptz)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz    text;
  v_local timestamp;
  v_day   date;
begin
  select timezone into v_tz from public.businesses where id = c.business_id;
  v_local := p_at at time zone coalesce(v_tz, 'Europe/Istanbul');
  v_day := v_local::date;
  if v_day < c.starts_on then return 'Kupon henüz başlamadı.'; end if;
  if v_day > c.ends_on then return 'Kuponun süresi dolmuş.'; end if;
  if cardinality(c.weekdays) > 0 and not (extract(isodow from v_day)::int = any (c.weekdays)) then
    return 'Kupon bu günde geçerli değil.';
  end if;
  if c.start_time is not null and not (v_local::time >= c.start_time and v_local::time < c.end_time) then
    return 'Kupon bu saatte geçerli değil (' || to_char(c.start_time, 'HH24:MI') || '-' || to_char(c.end_time, 'HH24:MI') || ' arası).';
  end if;
  return null;
end;
$$;

create function public.coupon_valid_at(c public.coupons, p_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.coupon_invalid_reason(c, p_at) is null;
$$;

-- Kupon kullanılmış mı: kasada işaretlendi ya da bağlı randevu gerçekleşti (add_review ile aynı kural:
-- tamamlandı ya da saati geçmiş onaylı). Randevu sonradan iptal/gelmedi olursa kendiliğinden false olur.
create function public.coupon_claim_used(cl public.coupon_claims)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select cl.redeemed_at is not null or exists (
    select 1 from public.appointments a
    where a.id = cl.appointment_id and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()))
  );
$$;

-- Müşterinin gözünden durum: used (kullanıldı), attached (aktif bir randevuya bağlı), expired (süresi doldu), active.
create function public.coupon_claim_state(cl public.coupon_claims)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ends date;
  v_tz   text;
begin
  if public.coupon_claim_used(cl) then return 'used'; end if;
  if exists (select 1 from public.appointments a where a.id = cl.appointment_id and a.status in ('pending', 'confirmed')) then
    return 'attached';
  end if;
  select c.ends_on, b.timezone into v_ends, v_tz
  from public.coupons c join public.businesses b on b.id = c.business_id where c.id = cl.coupon_id;
  if v_ends < (now() at time zone v_tz)::date then return 'expired'; end if;
  return 'active';
end;
$$;

-- Kasada bu kod şimdi kullanılamıyorsa sebebi, kullanılabiliyorsa null.
create function public.coupon_redeem_problem(cl public.coupon_claims)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  c  public.coupons;
  st text;
begin
  if cl.customer_id is null then return 'Kodun sahibinin hesabı silinmiş; bu kupon kullanılamaz.'; end if;
  st := public.coupon_claim_state(cl);
  if st = 'used' then return 'Bu kod zaten kullanıldı.'; end if;
  if st = 'attached' then return 'Bu kupon bir randevuya bağlı; indirim randevuda uygulanır.'; end if;
  select * into c from public.coupons where id = cl.coupon_id;
  return public.coupon_invalid_reason(c, now());
end;
$$;

-- Kasada girilen kodu işletmede arar. Yanlış kod kaydedilir ve boş döner (hata fırlatılsa kayıt geri alınırdı);
-- 10 dakikada 20 yanlış denemeden sonra doğru kod da çok fazla deneme hatası verir. Çağıran sahibi doğrulamalıdır.
create function public.coupon_lookup(p_business_id uuid, p_code text)
returns public.coupon_claims
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  cl     public.coupon_claims;
begin
  delete from public.coupon_code_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.coupon_code_attempts
      where business_id = p_business_id and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Kısa sürede çok fazla yanlış kod denendi; birkaç dakika sonra tekrar deneyin.';
  end if;
  select * into cl from public.coupon_claims where business_id = p_business_id and code = v_code;
  if not found then
    insert into public.coupon_code_attempts (business_id) values (p_business_id);
    return null;
  end if;
  return cl;
end;
$$;

revoke execute on function public.coupon_invalid_reason(public.coupons, timestamptz) from public, anon, authenticated;
revoke execute on function public.coupon_claim_used(public.coupon_claims) from public, anon, authenticated;
revoke execute on function public.coupon_claim_state(public.coupon_claims) from public, anon, authenticated;
revoke execute on function public.coupon_redeem_problem(public.coupon_claims) from public, anon, authenticated;
revoke execute on function public.coupon_lookup(uuid, text) from public, anon, authenticated;

-- Esnaf kupon açar (p_id boş) ya da düzenler. Kuponu Esnaf ve Pro paketleri açabilir. İlk alımdan sonra indirim, gün-saat
-- ve hizmetler değişmez; bitiş yalnızca uzatılır, sınır yalnızca yükseltilir (esnaf müşteriye söz vermiştir).
create function public.save_coupon(
  p_id uuid, p_title text, p_type text, p_value numeric, p_starts date, p_ends date,
  p_weekdays int[], p_start time, p_end time, p_limit int, p_services uuid[]
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b          public.businesses;
  c          public.coupons;
  v_title    text := trim(coalesce(p_title, ''));
  v_days     int[];
  v_services uuid[];
  v_today    date;
  v_id       uuid;
begin
  select * into b from public.businesses where owner_id = auth.uid();
  if not found then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if b.approval_status <> 'approved' or not public.plan_has_feature(b.id, 'coupons') then
    raise exception 'Kupon açmak için Esnaf veya Pro paketi gerekir.';
  end if;
  v_today := (now() at time zone b.timezone)::date;

  if length(v_title) not between 1 and 80 then raise exception 'Kupon başlığı 1 ile 80 karakter arasında olmalı.'; end if;
  if p_type is null or p_type not in ('percent', 'fixed') then raise exception 'İndirim türü yüzde ya da sabit tutar olmalı.'; end if;
  if p_value is null or p_value <= 0 or p_value > 100000 then raise exception 'İndirim değeri 0''dan büyük olmalı.'; end if;
  if p_type = 'percent' and p_value not between 1 and 90 then raise exception 'Yüzde indirim 1 ile 90 arasında olmalı.'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'Bitiş tarihi başlangıçtan önce olamaz.'; end if;
  if p_ends - p_starts + 1 > 90 then raise exception 'Kupon süresi en fazla 90 gün olabilir.'; end if;
  if (p_start is null) <> (p_end is null) or p_start >= p_end then
    raise exception 'Saat aralığı için başlangıç ve bitiş saatini birlikte girin; bitiş başlangıçtan sonra olmalı.';
  end if;
  if p_limit is not null and p_limit < 1 then raise exception 'Toplam sınır en az 1 olmalı.'; end if;
  if exists (select 1 from unnest(coalesce(p_weekdays, '{}')) d where d is null or d not between 1 and 7) then
    raise exception 'Günler 1 (Pazartesi) ile 7 (Pazar) arasında olmalı.';
  end if;
  select coalesce(array_agg(distinct d order by d), '{}') into v_days from unnest(coalesce(p_weekdays, '{}')) d;
  select coalesce(array_agg(distinct s order by s), '{}') into v_services from unnest(coalesce(p_services, '{}')) s;
  if (select count(*) from public.services where id = any (v_services) and business_id = b.id) <> cardinality(v_services) then
    raise exception 'Seçilen hizmetlerden biri bu işletmeye ait değil.';
  end if;

  if p_id is null then
    if p_ends < v_today then raise exception 'Bitiş tarihi geçmişte olamaz.'; end if;
    insert into public.coupons (business_id, title, discount_type, discount_value, starts_on, ends_on, weekdays,
                                start_time, end_time, total_limit, service_ids)
    values (b.id, v_title, p_type, p_value, p_starts, p_ends, v_days, p_start, p_end, p_limit, v_services)
    returning id into v_id;
    return v_id;
  end if;

  select * into c from public.coupons where id = p_id and business_id = b.id for update;
  if not found then raise exception 'Kupon bulunamadı.'; end if;
  if p_ends is distinct from c.ends_on and p_ends < v_today then raise exception 'Bitiş tarihi geçmişte olamaz.'; end if;
  if c.claimed_count > 0 then
    if p_type <> c.discount_type or p_value <> c.discount_value or v_days is distinct from c.weekdays
       or p_start is distinct from c.start_time or p_end is distinct from c.end_time
       or v_services is distinct from (select coalesce(array_agg(distinct s order by s), '{}') from unnest(c.service_ids) s) then
      raise exception 'Kupon alındıktan sonra indirim, gün ve saat aralığı ile hizmetler değiştirilemez.';
    end if;
    if p_ends < c.ends_on then raise exception 'Kupon alındıktan sonra bitiş tarihi kısaltılamaz.'; end if;
    if p_starts > c.starts_on then raise exception 'Kupon alındıktan sonra başlangıç tarihi ileri alınamaz.'; end if;
    if p_limit is not null and (c.total_limit is null or p_limit < c.total_limit) then
      raise exception 'Kupon alındıktan sonra toplam sınır düşürülemez.';
    end if;
  end if;

  update public.coupons
  set title = v_title, discount_type = p_type, discount_value = p_value, starts_on = p_starts, ends_on = p_ends,
      weekdays = v_days, start_time = p_start, end_time = p_end, total_limit = p_limit, service_ids = v_services
  where id = c.id;
  return c.id;
end;
$$;

-- Durdur/yeniden başlat. Durdurulan kupon yeni müşteriye verilmez; önceden alınan kodlar bitiş tarihine kadar çalışır.
create function public.set_coupon_active(p_id uuid, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.coupons where id = p_id;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  update public.coupons set is_active = coalesce(p_active, false) where id = p_id;
end;
$$;

-- Yalnızca hiç alınmamış kupon silinir; alınmışsa durdurulur.
create function public.delete_coupon(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.coupons;
begin
  select * into c from public.coupons where id = p_id for update;
  if not found or not public.is_business_owner(c.business_id) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if c.claimed_count > 0 then
    raise exception 'Alınmış kupon silinemez; kuponu durdurun.';
  end if;
  delete from public.coupons where id = c.id;
end;
$$;

-- Müşteri kuponu alır: hesabına özel 6 haneli kod, kişi başına bir kez. Kupon satırı kilitlenir; sınır aşılamaz.
create function public.claim_coupon(p_coupon_id uuid)
returns public.coupon_claims
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  c       public.coupons;
  v_today date;
  v_code  text;
  v_try   int := 0;
  cl      public.coupon_claims;
begin
  if v_uid is null then raise exception 'Kuponu almak için giriş yapmalısınız.'; end if;
  select * into c from public.coupons where id = p_coupon_id for update;
  if not found or not public.is_bookable(c.business_id) or not public.plan_has_feature(c.business_id, 'coupons') then
    raise exception 'Kupon bulunamadı.';
  end if;
  if not c.is_active then raise exception 'Bu kupon durduruldu.'; end if;
  select (now() at time zone b.timezone)::date into v_today from public.businesses b where b.id = c.business_id;
  if v_today > c.ends_on then raise exception 'Bu kuponun süresi dolmuş.'; end if;
  if v_today < c.starts_on then raise exception 'Bu kupon henüz başlamadı.'; end if;
  if exists (select 1 from public.coupon_claims where coupon_id = c.id and customer_id = v_uid) then
    raise exception 'Bu kuponu zaten aldınız.';
  end if;
  if c.total_limit is not null and c.claimed_count >= c.total_limit then
    raise exception 'Bu kuponun hakkı tükendi.';
  end if;

  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.coupon_claims where business_id = c.business_id and code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then raise exception 'Kod oluşturulamadı, lütfen tekrar deneyin.'; end if;
  end loop;

  insert into public.coupon_claims (coupon_id, business_id, customer_id, code)
  values (c.id, c.business_id, v_uid, v_code)
  returning * into cl;
  update public.coupons set claimed_count = claimed_count + 1 where id = c.id;
  return cl;
exception
  when unique_violation then
    raise exception 'Kupon alınamadı, lütfen tekrar deneyin.';
end;
$$;

-- Kasada kod sorgusu (yalnızca işletme sahibi). Kod yanlışsa null döner. problem boşsa kod şimdi kullanılabilir.
-- state: active | attached | used | expired.
create function public.find_coupon_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl     public.coupon_claims;
  c      public.coupons;
  v_name text;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  cl := public.coupon_lookup(p_business_id, p_code);
  if cl.id is null then return null; end if;
  select * into c from public.coupons where id = cl.coupon_id;
  if cl.customer_id is null then
    v_name := 'Eski üye';
  else
    select coalesce(nullif(trim(full_name), ''), 'Müşteri') into v_name from public.profiles where id = cl.customer_id;
  end if;
  return jsonb_build_object(
    'claim_id', cl.id, 'title', c.title, 'discount_type', c.discount_type, 'discount_value', c.discount_value,
    'customer_name', v_name, 'state', public.coupon_claim_state(cl), 'problem', public.coupon_redeem_problem(cl)
  );
end;
$$;

-- Kasada kodu kullanılmış sayar (yalnızca işletme sahibi). Yanlış kodda null döner (bkz. coupon_lookup);
-- kullanılamayan kodda sebebi hata olarak verir. Kullanılan kod satırının id'sini döndürür.
create function public.redeem_coupon_code(p_business_id uuid, p_code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl        public.coupon_claims;
  v_problem text;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  cl := public.coupon_lookup(p_business_id, p_code);
  if cl.id is null then return null; end if;
  select * into cl from public.coupon_claims where id = cl.id for update;
  v_problem := public.coupon_redeem_problem(cl);
  if v_problem is not null then raise exception '%', v_problem; end if;
  update public.coupon_claims set redeemed_at = now() where id = cl.id;
  return cl.id;
end;
$$;

-- Yanlış işaretlemeyi 10 dakika içinde geri alır.
create function public.undo_coupon_redeem(p_claim_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cl public.coupon_claims;
begin
  select * into cl from public.coupon_claims where id = p_claim_id for update;
  if not found or not public.is_business_owner(cl.business_id) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if cl.redeemed_at is null then raise exception 'Bu kupon kasada kullanılmış olarak işaretlenmemiş.'; end if;
  if now() - cl.redeemed_at > interval '10 minutes' then
    raise exception 'Geri alma süresi (10 dakika) geçti.';
  end if;
  update public.coupon_claims set redeemed_at = null where id = cl.id;
end;
$$;

-- Müşterinin kuponları ("Kuponlarım"). Durdurulmuş ya da bitmiş kuponlar da listelenir (coupons RLS'si göstermez).
create function public.my_coupons()
returns table (
  claim_id       uuid,
  code           text,
  claimed_at     timestamptz,
  redeemed_at    timestamptz,
  appointment_id uuid,
  coupon_id      uuid,
  title          text,
  discount_type  text,
  discount_value numeric,
  starts_on      date,
  ends_on        date,
  weekdays       int[],
  start_time     time,
  end_time       time,
  service_ids    uuid[],
  business_id    uuid,
  business_name  text,
  business_slug  text,
  state          text
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select cl.id, cl.code, cl.created_at, cl.redeemed_at, cl.appointment_id, c.id, c.title, c.discount_type,
         c.discount_value, c.starts_on, c.ends_on, c.weekdays, c.start_time, c.end_time, c.service_ids,
         b.id, b.name, b.slug, public.coupon_claim_state(cl)
  from public.coupon_claims cl
  join public.coupons c on c.id = cl.coupon_id
  join public.businesses b on b.id = cl.business_id
  where cl.customer_id = auth.uid()
  order by cl.created_at desc;
end;
$$;

-- Esnaf raporu: kuponlar ve her biri için alınan ve kullanılan sayısı (yalnızca işletme sahibi).
create function public.business_coupons(p_business_id uuid)
returns table (
  id             uuid,
  title          text,
  discount_type  text,
  discount_value numeric,
  starts_on      date,
  ends_on        date,
  weekdays       int[],
  start_time     time,
  end_time       time,
  total_limit    int,
  service_ids    uuid[],
  is_active      boolean,
  created_at     timestamptz,
  claimed        int,
  used           int
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  return query
  select c.id, c.title, c.discount_type, c.discount_value, c.starts_on, c.ends_on, c.weekdays, c.start_time, c.end_time,
         c.total_limit, c.service_ids, c.is_active, c.created_at,
         (select count(*)::int from public.coupon_claims cl where cl.coupon_id = c.id),
         (select count(*)::int from public.coupon_claims cl where cl.coupon_id = c.id and public.coupon_claim_used(cl))
  from public.coupons c
  where c.business_id = p_business_id
  order by c.created_at desc;
end;
$$;

-- Kupon: yalnızca kupon fonksiyonları yazar. Müşteri etkin, tarih aralığındaki kuponları (işletme yayında ve paketinde
-- kupon varken) okur; sahibi hepsini. Kod satırını müşteri kendininkini, sahibi işletmesininkini okur. Deneme kaydı kapalı.
alter table public.coupons enable row level security;
alter table public.coupon_claims enable row level security;
alter table public.coupon_code_attempts enable row level security;

create policy "kupon: herkes okur" on public.coupons
  for select using (
    is_active
    and public.is_bookable(business_id)
    and public.plan_has_feature(business_id, 'coupons')
    and (select (now() at time zone b.timezone)::date from public.businesses b where b.id = business_id)
        between starts_on and ends_on
  );
create policy "kupon: sahibi okur" on public.coupons
  for select using (public.is_business_owner(business_id));
create policy "kupon kodu: müşteri okur" on public.coupon_claims
  for select using (customer_id = (select auth.uid()));
create policy "kupon kodu: sahibi okur" on public.coupon_claims
  for select using (public.is_business_owner(business_id));

commit;
