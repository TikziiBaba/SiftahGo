-- =====================================================================
-- Fatura bilgileri ve muhasebe kayıtları.
-- - Esnaf fatura bilgisini girer; ödeme onaylanınca o anki bilgi ödemeye kopyalanır.
-- - Yönetici kestiği faturanın numarasını ve tarihini ödemeye yazar. Resmî fatura bu sistemde üretilmez.
-- - Ödeme kayıtları işletme silinse de kalır (yasal saklama).
-- - Giderler yalnızca yöneticiye açıktır.
-- 20261107_sadakat_sehir.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

alter table public.payments
  alter column business_id drop not null,
  drop constraint payments_business_id_fkey,
  add constraint payments_business_id_fkey foreign key (business_id) references public.businesses (id) on delete set null,
  add column business_name text not null default '',
  add column billing_snapshot jsonb,
  add column invoice_number text check (length(invoice_number) between 1 and 40),
  add column invoice_date date,
  add column invoice_url text check (invoice_url ~ '^https://\S+$' and length(invoice_url) <= 500),
  add constraint payments_invoice_check check ((invoice_number is null) = (invoice_date is null));
update public.payments p set business_name = b.name from public.businesses b where b.id = p.business_id;

-- ---------------------------------------------------------------------
-- Fatura ve muhasebe
-- ---------------------------------------------------------------------
-- Fatura bilgileri ayrı tabloda: işletme satırı herkese açık, vergi ve T.C. kimlik numarası değil.
create table public.billing_profiles (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  kind        text not null check (kind in ('individual', 'company')),
  legal_name  text not null check (length(trim(legal_name)) between 2 and 200),
  tax_id      text not null,
  tax_office  text not null default '' check (length(tax_office) <= 100),
  address     text not null check (length(trim(address)) between 5 and 300),
  updated_at  timestamptz not null default now(),
  constraint billing_profiles_tax_check check (
    (kind = 'individual' and tax_id ~ '^[0-9]{11}$')
    or (kind = 'company' and tax_id ~ '^[0-9]{10}$' and length(trim(tax_office)) > 1)
  )
);
alter table public.billing_profiles enable row level security;
create policy "fatura: sahibi okur" on public.billing_profiles
  for select using ((select public.is_business_owner(business_id)));
create policy "fatura: sahibi ekler" on public.billing_profiles
  for insert with check ((select public.is_business_owner(business_id)));
create policy "fatura: sahibi günceller" on public.billing_profiles
  for update using ((select public.is_business_owner(business_id))) with check ((select public.is_business_owner(business_id)));
create policy "fatura: yönetici okur" on public.billing_profiles
  for select using ((select public.is_admin()));

-- Giderler: yalnızca yönetici.
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date not null,
  category    text not null check (category in ('altyapi', 'reklam', 'baski', 'muhasebe', 'vergi', 'diger')),
  description text not null check (length(trim(description)) between 2 and 200),
  amount      numeric(10, 2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);
create index expenses_spent_on_idx on public.expenses (spent_on desc);
alter table public.expenses enable row level security;
create policy "gider: yönetici okur" on public.expenses for select using ((select public.is_admin()));
create policy "gider: yönetici ekler" on public.expenses for insert with check ((select public.is_admin()));
create policy "gider: yönetici siler" on public.expenses for delete using ((select public.is_admin()));

-- Ödeme kaydına işletme adı; ödeme onaylanınca o anki fatura bilgisi. Sonradan değişen bilgi eski kaydı etkilemez.
create function public.payments_fill_billing()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.billing_profiles;
begin
  if new.business_id is not null and new.business_name = '' then
    select b.name into new.business_name from public.businesses b where b.id = new.business_id;
    new.business_name := coalesce(new.business_name, '');
  end if;
  if new.status = 'paid' and new.billing_snapshot is null and new.business_id is not null
     and (tg_op = 'INSERT' or old.status <> 'paid') then
    select * into v_profile from public.billing_profiles p where p.business_id = new.business_id;
    if found then
      new.billing_snapshot := jsonb_build_object(
        'kind', v_profile.kind, 'legal_name', v_profile.legal_name, 'tax_id', v_profile.tax_id,
        'tax_office', v_profile.tax_office, 'address', v_profile.address
      );
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_fill_billing
  before insert or update on public.payments
  for each row execute function public.payments_fill_billing();

-- Yönetici kestiği faturayı ödemeye işler; numara boşsa kayıt silinir.
create function public.admin_set_invoice(p_id uuid, p_number text, p_date date, p_url text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_number text := nullif(trim(coalesce(p_number, '')), '');
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if v_number is not null and p_date is null then raise exception 'Fatura tarihini girin.'; end if;
  update public.payments
  set invoice_number = v_number,
      invoice_date = case when v_number is null then null else p_date end,
      invoice_url = case when v_number is null then null else nullif(trim(coalesce(p_url, '')), '') end
  where id = p_id and status = 'paid';
  if not found then raise exception 'Ödenmiş kayıt bulunamadı.'; end if;
end;
$$;

commit;
