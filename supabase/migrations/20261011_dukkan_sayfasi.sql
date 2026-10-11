-- =====================================================================
-- Dükkân sayfası özelleştirme: sayfa rengi (Pro), duyuru bandı ve kısayollar (Esnaf, Pro)
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor'de çalıştırın. Veri silmez.
-- =====================================================================

begin;

alter table public.businesses
  add column accent text not null default 'turkuaz'
    check (accent in ('turkuaz', 'zumrut', 'gok', 'lavanta', 'pembe', 'kehribar', 'mercan')),
  add column announcement text not null default '' check (length(announcement) <= 160),
  add column whatsapp text not null default '' check (whatsapp ~ '^[0-9+ ()-]{0,20}$'),
  add column instagram text not null default '' check (instagram ~ '^[A-Za-z0-9._]{0,30}$'),
  add column website text not null default ''
    check (website = '' or (website ~ '^https?://\S+$' and length(website) <= 200));

-- Yeni özellikler eklenir; yöneticinin paketlere verdiği diğer özellikler korunur.
update public.plans
set features = features || array(select f from unnest('{announcement,links}'::text[]) f where f <> all (features))
where id in ('esnaf', 'pro');

update public.plans
set features = features || array(select f from unnest('{theme}'::text[]) f where f <> all (features))
where id = 'pro';

commit;
