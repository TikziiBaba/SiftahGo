-- =====================================================================
-- Ücretsiz deneme 7 günden 2 aya çıkar (2026-11-01):
-- - Bundan sonra onaylanan işletme 2 ay Pro deneme alır.
-- - Şu an denemede olan işletmelerin süresi de 2 aya tamamlanır. Ödeme yapmışlara ve denemesi bitmişlere dokunulmaz.
-- 20261102_destek_talepleri.sql'den SONRA, web yayınından ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Onayda işletmenin hiç aboneliği olmadıysa 2 ay ücretsiz deneme başlar: Pro paketin tüm özellikleri.
create or replace function public.admin_review_business(p_business_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  select approval_status into v_status from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  if v_status = 'approved' then raise exception 'İşletme zaten onaylı.'; end if;

  if p_approve then
    update public.businesses
    set approval_status = 'approved', approval_note = '', reviewed_at = now(), reviewed_by = auth.uid(),
        plan_id = case when subscription_ends_at is null then 'pro' else plan_id end,
        trial_ends_at = case when subscription_ends_at is null then now() + interval '2 months' else trial_ends_at end,
        subscription_ends_at = coalesce(subscription_ends_at, now() + interval '2 months')
    where id = p_business_id;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Ret sebebini yazın.'; end if;
    update public.businesses
    set approval_status = 'rejected', approval_note = left(trim(p_note), 500), reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_business_id;
  end if;
end;
$$;

-- Denemedekiler: subscription_ends_at = trial_ends_at. 7 gün yerine 2 ay sayılır; askıda eklenen süre korunur.
update public.businesses
set trial_ends_at = trial_ends_at + interval '2 months' - interval '7 days',
    subscription_ends_at = subscription_ends_at + interval '2 months' - interval '7 days'
where subscription_ends_at > now() and subscription_ends_at = trial_ends_at;

commit;
