-- =====================================================================
-- Bakiye sistemi kaldırılır (20261014_bakiye_yasal.sql'deki bakiye kısmı).
-- /yasal ve /iletisim ayrılmış adres kuralı kalır.
-- 20261014_bakiye_yasal.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- Canlıda bakiye hareketi ve bakiye yükleme ödemesi yoktu (2026-10-12); silinen veri yok.
-- =====================================================================

begin;

drop function public.create_topup(numeric);
drop function public.buy_plan_with_balance(text);
drop function public.admin_adjust_balance(uuid, numeric, text);
drop function public.business_balance(uuid);
drop table public.balance_transactions;

-- Her ödeme yine bir pakete aittir.
alter table public.payments alter column plan_id set not null;

-- PayTR "başarılı" bildirimi: sadece sunucu (service_role) çağırır.
-- Aynı bildirim tekrar gelirse bir şey yapmaz.
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
  perform public.apply_subscription(pay.business_id, pay.plan_id, 30);
end;
$$;

commit;
