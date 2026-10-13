-- =====================================================================
-- Hata kaydı: web (tarayıcı + sunucu) ve mobil hataları Supabase'de tutulur (dış servis yok).
-- 20261021_asama5.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- Uygulama hataları (web tarayıcı, web sunucu, mobil); log_error yazar, yalnızca yönetici okur. Dış servise
-- veri gitmez. Aynı hata (kaynak + mesaj + yığının ilk satırı) tek satırda sayılır; tekrar edince çözüldü işareti kalkar.
create table public.error_logs (
  id           uuid primary key default gen_random_uuid(),
  fingerprint  text not null unique,
  source       text not null check (source in ('web', 'server', 'mobile')),
  message      text not null,
  stack        text not null default '',
  url          text not null default '',
  app_version  text not null default '',
  user_agent   text not null default '',
  last_user_id uuid references public.profiles (id) on delete set null,
  count        int not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  resolved_at  timestamptz
);
create index error_logs_last_seen_idx on public.error_logs (last_seen desc);

-- Uygulama hatasını kaydeder (girişsiz de çağrılabilir). Uzun metinler kısaltılır; kötüye kullanıma karşı son
-- 24 saatte en fazla 500 yeni hata türü açılır. 90 günden eski kayıtlar silinir.
create function public.log_error(
  p_source      text,
  p_message     text,
  p_stack       text default '',
  p_url         text default '',
  p_app_version text default '',
  p_user_agent  text default ''
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_message text := left(trim(coalesce(p_message, '')), 1000);
  v_stack   text := left(coalesce(p_stack, ''), 8000);
  v_fp      text;
begin
  if v_message = '' or p_source is null or p_source not in ('web', 'server', 'mobile') then return; end if;
  v_fp := md5(p_source || '|' || v_message || '|' || split_part(v_stack, E'\n', 2));

  update public.error_logs
  set count = count + 1,
      last_seen = now(),
      last_user_id = coalesce(auth.uid(), last_user_id),
      url = left(coalesce(p_url, ''), 500),
      app_version = left(coalesce(p_app_version, ''), 100),
      user_agent = left(coalesce(p_user_agent, ''), 300),
      resolved_at = null
  where fingerprint = v_fp;
  if found then return; end if;

  if (select count(*) from public.error_logs where first_seen > now() - interval '24 hours') >= 500 then return; end if;
  delete from public.error_logs where last_seen < now() - interval '90 days';
  insert into public.error_logs (fingerprint, source, message, stack, url, app_version, user_agent, last_user_id)
  values (
    v_fp, p_source, v_message, v_stack, left(coalesce(p_url, ''), 500),
    left(coalesce(p_app_version, ''), 100), left(coalesce(p_user_agent, ''), 300), auth.uid()
  )
  on conflict (fingerprint) do update set count = public.error_logs.count + 1, last_seen = now();
end;
$$;

-- Hata kayıtları: log_error yazar; yönetici okur, çözüldü işaretler ve siler.
alter table public.error_logs enable row level security;
create policy "hata: yönetici okur" on public.error_logs for select using (public.is_admin());
create policy "hata: yönetici günceller" on public.error_logs
  for update using (public.is_admin()) with check (public.is_admin());
create policy "hata: yönetici siler" on public.error_logs for delete using (public.is_admin());

commit;
