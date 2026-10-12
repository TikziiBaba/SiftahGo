-- =====================================================================
-- Paket fiyatları yükselir (bakiye ve %8 komisyon kaldırıldı; gelir yalnızca paketlerden).
-- Canlı veritabanına 2026-10-12'de uygulandı.
-- =====================================================================
update public.plans set price = 349 where id = 'baslangic';
update public.plans set price = 649 where id = 'esnaf';
update public.plans set price = 999 where id = 'pro';
