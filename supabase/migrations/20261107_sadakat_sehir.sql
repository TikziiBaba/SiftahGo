-- =====================================================================
-- İsteğe bağlı sadakat kartı ve /sehir sayfaları.
-- - Esnaf kuralı kendi açar ("10. randevuda saç yıkama bedava"). Damga, tamamlanan randevudan hesaplanır.
-- - 'sehir' ayrılmış işletme adreslerine eklenir (kısıt adı şemadakiyle aynı kalır).
-- 20261106_vitrin.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- Önce kontrol: select id, name from public.businesses where slug = 'sehir';
-- Satır dönerse o işletmenin adresi değiştirilmeden kısıt eklenemez.
-- =====================================================================

begin;

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.businesses'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%sifre-yenile%';
  execute format('alter table public.businesses drop constraint %I', c);
end $$;
alter table public.businesses add constraint businesses_slug_check1 check (slug not in (
  'panel', 'kesfet', 'giris', 'kayit', 'hesabim', 'api', 'auth', 'admin',
  'sifremi-unuttum', 'sifre-yenile', 'yasal', 'iletisim', 'esnaf', 'sehir'
));

alter table public.businesses
  add column loyalty_target int check (loyalty_target between 2 and 50),
  add column loyalty_reward text not null default '' check (length(loyalty_reward) <= 100),
  add constraint businesses_loyalty_check check (loyalty_target is null or length(trim(loyalty_reward)) > 0);

update public.plans set features = features || '{loyalty}' where id in ('esnaf', 'pro');

-- ---------------------------------------------------------------------
-- Sadakat kartı
-- ---------------------------------------------------------------------
-- Verilen ödüller. Damga saklanmaz, randevudan hesaplanır: iptal ve "gelmedi" ek iş gerektirmez.
create table public.loyalty_rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  given_at    timestamptz not null default now()
);
create index loyalty_rewards_business_idx on public.loyalty_rewards (business_id, customer_id);
create index loyalty_rewards_customer_idx on public.loyalty_rewards (customer_id);
alter table public.loyalty_rewards enable row level security;
create policy "sadakat: müşteri kendi ödülünü okur" on public.loyalty_rewards
  for select using (customer_id = (select auth.uid()));
create policy "sadakat: sahibi okur" on public.loyalty_rewards
  for select using ((select public.is_business_owner(business_id)));

-- Bir müşterinin işletmedeki damgası: tamamlanan ya da onaylı olup saati geçen randevu (add_review ile aynı kural).
create function public.loyalty_stamps(p_business_id uuid, p_customer_id uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.appointments a
  where a.business_id = p_business_id and a.customer_id = p_customer_id
    and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()));
$$;
revoke execute on function public.loyalty_stamps(uuid, uuid) from public, anon, authenticated;

-- İşletme sayfasındaki kart. Kural kapalıysa ya da paket düştüyse boş döner; girişsiz ziyaretçi kuralı görür.
create function public.my_loyalty(p_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  b       public.businesses;
  v_uid   uuid := auth.uid();
  v_visit int := 0;
  v_given int := 0;
begin
  select * into b from public.businesses where id = p_business_id;
  if not found or b.loyalty_target is null or b.business_type <> 'appointment'
     or not public.is_bookable(b.id) or not public.plan_has_feature(b.id, 'loyalty') then
    return null;
  end if;
  if v_uid is not null then
    v_visit := public.loyalty_stamps(b.id, v_uid);
    select count(*)::int into v_given from public.loyalty_rewards r where r.business_id = b.id and r.customer_id = v_uid;
  end if;
  return jsonb_build_object(
    'target', b.loyalty_target,
    'reward', b.loyalty_reward,
    'stamps', v_visit % b.loyalty_target,
    'available', greatest(v_visit / b.loyalty_target - v_given, 0)
  );
end;
$$;

-- Esnafın müşteri listesi: en çok gelen üstte.
create function public.business_loyalty(p_business_id uuid)
returns table (customer_id uuid, customer_name text, visits int, available int)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_target int;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Yetkiniz yok.'; end if;
  select b.loyalty_target into v_target from public.businesses b where b.id = p_business_id;
  if v_target is null then return; end if;
  return query
  select x.customer_id, x.customer_name, x.visits,
         greatest(x.visits / v_target - (
           select count(*)::int from public.loyalty_rewards r
           where r.business_id = p_business_id and r.customer_id = x.customer_id
         ), 0)
  from (
    select a.customer_id,
           (array_agg(a.customer_name order by a.starts_at desc))[1] as customer_name,
           count(*)::int as visits
    from public.appointments a
    where a.business_id = p_business_id and a.customer_id is not null
      and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at <= now()))
    group by a.customer_id
  ) x
  order by 4 desc, x.visits desc
  limit 200;
end;
$$;

-- Esnaf ödülü verdiğini işaretler. İşletme satırı kilitlenir: aynı ödül iki kez verilmez.
create function public.give_loyalty_reward(p_business_id uuid, p_customer_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_target int;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Yetkiniz yok.'; end if;
  select b.loyalty_target into v_target from public.businesses b where b.id = p_business_id for update;
  if v_target is null or not public.plan_has_feature(p_business_id, 'loyalty') then
    raise exception 'Sadakat kartı açık değil.';
  end if;
  if public.loyalty_stamps(p_business_id, p_customer_id) / v_target
     <= (select count(*) from public.loyalty_rewards r where r.business_id = p_business_id and r.customer_id = p_customer_id) then
    raise exception 'Bu müşterinin bekleyen ödülü yok.';
  end if;
  insert into public.loyalty_rewards (business_id, customer_id) values (p_business_id, p_customer_id);
end;
$$;

commit;
