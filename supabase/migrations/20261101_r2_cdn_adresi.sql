-- =====================================================================
-- R2'nin herkese açık adresi r2.dev'den cdn.siftahgo.app'e taşındı (2026-11-01). Dosyalar aynı kovada, yalnızca
-- adres değişir. Vercel'de CLOUDFLARE_R2_PUBLIC_URL değişip site yeniden yayınlanmadan HEMEN ÖNCE çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

create or replace function public.is_upload_url(p_url text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(
    p_url ~ '^https://cdn\.siftahgo\.app/businesses/[0-9a-f-]{36}/(logo|cover|gallery)/[A-Za-z0-9._-]+$',
    false
  );
$$;

update public.businesses
set logo_url = replace(logo_url, 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/', 'https://cdn.siftahgo.app/'),
    cover_url = replace(cover_url, 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/', 'https://cdn.siftahgo.app/'),
    gallery = array(select replace(u, 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/', 'https://cdn.siftahgo.app/') from unnest(gallery) u)
where logo_url like 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/%'
   or cover_url like 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/%'
   or array_to_string(gallery, ' ') like '%pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/%';

update public.staff
set avatar_url = replace(avatar_url, 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/', 'https://cdn.siftahgo.app/')
where avatar_url like 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/%';

commit;
