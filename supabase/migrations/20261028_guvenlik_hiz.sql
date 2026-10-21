-- =====================================================================
-- Güvenlik ve hız:
-- - İtibar zehirleme kapandı: işletme, hesapla alınan yaklaşan randevuyu "gelmedi" işaretleyemez ve doğrudan yazmayla
--   geçmiş bir saate alamaz. Gelmeme sayısı tüm işletmelerde sayıldığı için (customer_history) bir işletme, müşterinin
--   yaklaşan iki randevusunu hemen "gelmedi" yapıp onu her yerde "sık gelmeyen" gösterebiliyordu.
-- - protect_business_columns: arama yolu (search_path) sabitlendi.
-- - RLS: auth.uid() ve is_admin() "(select ...)" içinde; her satırda değil, sorguda bir kez hesaplanır.
-- - reviews_customer_idx: müşteri kartı (customer_card) müşterinin yorumlarını indeksle bulur.
-- 20261027_randevu_onayi.sql'den SONRA çalıştırın.
-- Canlı veritabanına bir kez uygulanır: Supabase > SQL Editor.
-- =====================================================================

begin;

-- İşletme sahibi randevuyu doğrudan (RLS ile) yazarken korunan alanlar; bkz. schema.sql.
create or replace function public.protect_appointment_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.customer_id := null;
      new.customer_email := null;
      new.package_id := null;
    else
      new.business_id := old.business_id;
      new.customer_id := old.customer_id;
      new.customer_email := old.customer_email;
      new.package_id := old.package_id;
      new.created_at := old.created_at;
      if old.customer_id is not null then
        new.customer_phone := old.customer_phone;
        -- Hesapla alınan yaklaşan randevu "gelmedi" yapılamaz, saati de geçmişe alınamaz: müşterinin gelmeme sayısı
        -- tüm işletmelerde sayıldığı için (customer_history) işletme, randevuyu hemen "gelmedi" işaretleyip müşteriyi
        -- her yerde "sık gelmeyen" gösterebilirdi.
        if new.starts_at is distinct from old.starts_at and new.starts_at <= now() and old.starts_at > now() then
          raise exception 'Randevu geçmiş bir saate alınamaz.';
        end if;
        if new.status = 'no_show' and old.status is distinct from 'no_show' and new.starts_at > now() then
          raise exception 'Randevu saati gelmeden "Gelmedi" işaretlenemez.';
        end if;
      end if;
    end if;
    if new.staff_id is not null and (tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id)
       and not exists (select 1 from public.staff s where s.id = new.staff_id and s.business_id = new.business_id) then
      raise exception 'Personel bulunamadı.';
    end if;
    if new.service_id is not null and (tg_op = 'INSERT' or new.service_id is distinct from old.service_id)
       and not exists (select 1 from public.services s where s.id = new.service_id and s.business_id = new.business_id) then
      raise exception 'Hizmet bulunamadı.';
    end if;
  end if;
  return new;
end;
$$;

alter function public.protect_business_columns() set search_path = '';

create index if not exists reviews_customer_idx on public.reviews (customer_id, created_at desc);

-- auth.uid() ve is_admin() sorguda bir kez hesaplansın.
alter policy "bildirim: kendininkini okur" on public.inbox using (user_id = (select auth.uid()));
alter policy "favori: kendi listesini yönetir" on public.favorites using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
alter policy "bekleme: kendininkini okur" on public.waitlist using (customer_id = (select auth.uid()));
alter policy "bekleme: kendininkini siler" on public.waitlist using (customer_id = (select auth.uid()));
alter policy "profil: kendini okur" on public.profiles using (id = (select auth.uid()));
alter policy "profil: kendini günceller" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "işletme: yayındakileri herkes okur" on public.businesses using (
  (approval_status = 'approved' and is_published and not is_suspended and subscription_ends_at > now())
  or owner_id = (select auth.uid())
);
alter policy "işletme: sahibi oluşturur" on public.businesses with check (owner_id = (select auth.uid()));
alter policy "işletme: sahibi günceller" on public.businesses using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy "işletme: sahibi siler" on public.businesses using (owner_id = (select auth.uid()));
alter policy "randevu: müşteri ve işletme okur" on public.appointments using (customer_id = (select auth.uid()) or public.is_business_owner(business_id));
alter policy "admin: profilleri okur" on public.profiles using ((select public.is_admin()));
alter policy "admin: işletmeleri okur" on public.businesses using ((select public.is_admin()));
alter policy "admin: hizmetleri okur" on public.services using ((select public.is_admin()));
alter policy "admin: personeli okur" on public.staff using ((select public.is_admin()));
alter policy "admin: randevuları okur" on public.appointments using ((select public.is_admin()));
alter policy "admin: ödemeleri okur" on public.payments using ((select public.is_admin()));
alter policy "admin: bildirimleri okur" on public.notifications using ((select public.is_admin()));
alter policy "admin: paket ekler" on public.plans with check ((select public.is_admin()));
alter policy "admin: paket günceller" on public.plans using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "hata: yönetici okur" on public.error_logs using ((select public.is_admin()));
alter policy "hata: yönetici günceller" on public.error_logs using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "hata: yönetici siler" on public.error_logs using ((select public.is_admin()));

commit;
