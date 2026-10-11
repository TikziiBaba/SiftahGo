-- =====================================================================
-- Bakiye (yüklenir, paket almak için kullanılır, nakit olarak çekilemez) ve
-- yasal sayfa adresleri (/yasal, /iletisim) için ayrılmış işletme adresleri.
-- 20261013_yorumlar_iptal_uyarisi.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor. Veri silmez.
-- =====================================================================

begin;

-- plan_id boşsa ödeme bakiye yüklemesidir.
alter table public.payments alter column plan_id drop not null;

create table public.balance_transactions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount      numeric(10, 2) not null check (amount <> 0),
  kind        text not null check (kind in ('topup', 'plan', 'admin')),
  plan_id     text references public.plans (id),
  payment_id  uuid unique references public.payments (id) on delete set null,
  note        text not null default '' check (length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index balance_transactions_business_idx on public.balance_transactions (business_id, created_at desc);

alter table public.balance_transactions enable row level security;
create policy "bakiye: işletme kendi hareketlerini okur" on public.balance_transactions
  for select using (public.is_business_owner(business_id));
create policy "admin: bakiye hareketlerini okur" on public.balance_transactions for select using (public.is_admin());

-- Ayrılmış adreslere 'yasal' ve 'iletisim' eklenir (kısıt adı şemadakiyle aynı kalır).
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.businesses'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%sifre-yenile%';
  execute format('alter table public.businesses drop constraint %I', c);
end $$;
alter table public.businesses add constraint businesses_slug_check1 check (slug not in (
  'panel', 'kesfet', 'giris', 'kayit', 'hesabim', 'api', 'auth', 'admin',
  'sifremi-unuttum', 'sifre-yenile', 'yasal', 'iletisim'
));

create function public.create_topup(p_amount numeric)
returns table (merchant_oid text, amount numeric)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_oid text;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Önce işletmenizi oluşturun.'; end if;
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount not between 50 and 10000 then
    raise exception 'Yükleme tutarı 50 ile 10.000 TL arasında, tam sayı olmalı.';
  end if;

  v_oid := 'SG' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || substr(md5(gen_random_uuid()::text), 1, 10);
  insert into public.payments (business_id, merchant_oid, amount) values (v_business, v_oid, p_amount);

  return query select v_oid, p_amount;
end;
$$;

create function public.business_balance(p_business_id uuid)
returns numeric
language sql stable set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.balance_transactions where business_id = p_business_id;
$$;

create function public.buy_plan_with_balance(p_plan_id text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_plan public.plans;
begin
  -- Aynı anda iki alım bakiyeyi eksiye düşürmesin diye işletme satırı kilitlenir.
  select id into v_business from public.businesses where owner_id = auth.uid() for update;
  if v_business is null then raise exception 'Önce işletmenizi oluşturun.'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'Paket bulunamadı.'; end if;
  if public.business_balance(v_business) < v_plan.price then
    raise exception 'Bakiyeniz yetersiz.';
  end if;

  insert into public.balance_transactions (business_id, amount, kind, plan_id)
  values (v_business, -v_plan.price, 'plan', v_plan.id);
  perform public.apply_subscription(v_business, v_plan.id, 30);
end;
$$;

-- Paket ödemesi paketi başlatır, bakiye yüklemesi bakiyeye eklenir.
create or replace function public.activate_subscription(p_merchant_oid text, p_total_amount numeric)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where merchant_oid = p_merchant_oid for update;
  if not found then raise exception 'Ödeme bulunamadı: %', p_merchant_oid; end if;
  if pay.status <> 'pending' then return; end if;
  if p_total_amount < pay.amount then
    raise exception 'Ödenen tutar eksik: % < %', p_total_amount, pay.amount;
  end if;

  update public.payments set status = 'paid', paid_at = now() where id = pay.id;
  if pay.plan_id is null then
    insert into public.balance_transactions (business_id, amount, kind, payment_id)
    values (pay.business_id, pay.amount, 'topup', pay.id);
  else
    perform public.apply_subscription(pay.business_id, pay.plan_id, 30);
  end if;
end;
$$;

create function public.admin_adjust_balance(p_business_id uuid, p_amount numeric, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if p_amount is null or round(p_amount, 2) = 0 or abs(p_amount) > 100000 then
    raise exception 'Tutar 0 olamaz ve 100.000 TL''yi geçemez.';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Açıklama yazın.'; end if;
  perform 1 from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if public.business_balance(p_business_id) + round(p_amount, 2) < 0 then
    raise exception 'Bakiye eksiye düşemez.';
  end if;

  insert into public.balance_transactions (business_id, amount, kind, note)
  values (p_business_id, round(p_amount, 2), 'admin', left(trim(p_note), 200));
end;
$$;

commit;
