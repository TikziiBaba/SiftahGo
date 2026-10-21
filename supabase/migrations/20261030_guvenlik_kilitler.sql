-- =====================================================================
-- Güvenlik kilitleri (2026-10-21, dördüncü tur):
-- - İşletme görselleri (logo, kapak, galeri) ve personel fotoğrafı yalnızca sitenin R2'ye yüklediği dosyalar olabilir
--   (is_upload_url). Başka bir adres mobil uygulamada ziyaretçinin IP'sini o adresin sahibine sızdırabiliyordu.
--   Kurala uymayan eski adresler kaldırılır; web'de zaten CSP yüzünden görünmüyorlardı.
-- - Profilin ve işletmenin kayıt tarihi elle değiştirilemez (müşteri kartındaki "üyelik tarihi" geriye alınamaz).
-- - Telefon bildirim adresi (push token) en fazla 200 karakter.
-- - Hesap silinince müşterinin e-postası randevu ve bildirim kayıtlarından da silinir.
-- 20261029_admin_isletme_duzenle.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

create or replace function public.is_upload_url(p_url text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(
    p_url ~ '^https://pub-2085cc7ac85a468292c6576a0f6ea8af\.r2\.dev/businesses/[0-9a-f-]{36}/(logo|cover|gallery)/[A-Za-z0-9._-]+$',
    false
  );
$$;

create or replace function public.is_upload_urls(p_urls text[])
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(public.is_upload_url(u)), true) from unnest(p_urls) u;
$$;


update public.businesses set logo_url = null where logo_url is not null and not public.is_upload_url(logo_url);
update public.businesses set cover_url = null where cover_url is not null and not public.is_upload_url(cover_url);
update public.businesses set gallery = array(select u from unnest(gallery) u where public.is_upload_url(u))
where not public.is_upload_urls(gallery);
update public.staff set avatar_url = null where avatar_url is not null and not public.is_upload_url(avatar_url);

alter table public.businesses drop constraint if exists businesses_images_upload_check;
alter table public.businesses add constraint businesses_images_upload_check check (
  (logo_url is null or public.is_upload_url(logo_url))
  and (cover_url is null or public.is_upload_url(cover_url))
  and public.is_upload_urls(gallery)
);
alter table public.staff drop constraint if exists staff_avatar_upload_check;
alter table public.staff add constraint staff_avatar_upload_check check (avatar_url is null or public.is_upload_url(avatar_url));

delete from public.push_tokens where length(token) > 200;
alter table public.push_tokens drop constraint if exists push_tokens_token_length;
alter table public.push_tokens add constraint push_tokens_token_length check (length(token) <= 200);

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;


drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

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
      new.created_at := now();
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
      new.id := old.id;
      new.created_at := old.created_at;
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


create or replace function public.delete_my_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Giriş yapmalısınız.'; end if;
  if exists (select 1 from public.businesses b where b.owner_id = v_uid) then
    raise exception 'İşletme hesabı buradan silinemez. Lütfen destek adresimize yazın.';
  end if;
  update public.appointments set status = 'cancelled'
  where customer_id = v_uid and status in ('pending', 'confirmed') and starts_at > now();
  update public.reviews set customer_name = 'Eski üye' where customer_id = v_uid;
  -- Hesabın e-posta adresi işletmelerin defterinde ve gönderim kayıtlarında kalmaz.
  delete from public.notifications n using public.appointments a
  where a.id = n.appointment_id and a.customer_id = v_uid and n.recipient = 'customer';
  update public.appointments set customer_email = null where customer_id = v_uid;
end;
$$;


commit;
