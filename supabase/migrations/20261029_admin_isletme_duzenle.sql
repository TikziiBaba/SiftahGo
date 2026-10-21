-- =====================================================================
-- Yönetici işletmeyi düzenler: ad, adres, açıklama, logo, kapak, galeri vb. (/admin/isletmeler/[id]).
-- - RLS: yönetici işletme satırını günceller. Abonelik, puan, askı ve onay alanları işletme sahibindeki gibi
--   protect_business_columns ile korunur; yönetici bunları yalnızca admin_* fonksiyonlarıyla değiştirir.
-- - protect_business_columns: işletmenin sahibi (owner_id) güncellemeyle değiştirilemez.
-- 20261028_guvenlik_hiz.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

create or replace function public.protect_business_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
      perform now() at time zone new.timezone;
    end if;
    if tg_op = 'INSERT' then
      new.rating_avg := 0;
      new.rating_count := 0;
      new.plan_id := null;
      new.subscription_ends_at := null;
      new.trial_ends_at := null;
      new.is_suspended := false;
      new.referral_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
      new.referred_by := null;
      new.referral_rewarded_at := null;
      new.approval_status := 'pending';
      new.approval_note := '';
      new.submitted_at := now();
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.owner_id := old.owner_id;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.plan_id := old.plan_id;
      new.subscription_ends_at := old.subscription_ends_at;
      new.trial_ends_at := old.trial_ends_at;
      new.is_suspended := old.is_suspended;
      new.referral_code := old.referral_code;
      new.referred_by := old.referred_by;
      new.referral_rewarded_at := old.referral_rewarded_at;
      if old.approval_status = 'rejected' and new.approval_status = 'pending' then
        new.submitted_at := now();
      else
        new.approval_status := old.approval_status;
        new.submitted_at := old.submitted_at;
      end if;
      new.approval_note := old.approval_note;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "admin: işletmeleri günceller" on public.businesses;
create policy "admin: işletmeleri günceller" on public.businesses
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

commit;
