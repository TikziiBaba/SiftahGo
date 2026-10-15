-- =====================================================================
-- Web sitesi müşteri (/) ve işletme sahibi (/esnaf) olarak ikiye ayrıldı.
-- 'esnaf' ayrılmış işletme adreslerine eklenir (kısıt adı şemadakiyle aynı kalır).
-- 20261023_guvenlik.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- Önce kontrol: select id, name from public.businesses where slug = 'esnaf';
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
  'sifremi-unuttum', 'sifre-yenile', 'yasal', 'iletisim', 'esnaf'
));

commit;
