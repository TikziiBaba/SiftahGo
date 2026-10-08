import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';

// Supabase'e uygulamadan önce şemayı yerelde (WASM Postgres) dener: npm run test:db
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = new PGlite({ extensions: { btree_gist } });

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };
const expectError = async (fn, re, msg) => {
  try { await fn(); ok(false, msg + ' (hata bekleniyordu)'); }
  catch (e) { ok(re.test(e.message), `${msg} -> ${e.message}`); }
};

// Supabase taklidi
await db.exec(`
  create schema auth; create schema extensions;
  create role anon nologin; create role authenticated nologin;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, extensions, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('00000000-0000-0000-0000-00000000000e', 'eski@x.com', '{"full_name":"Eski"}');
`);

await db.exec(schema);
await db.exec(schema); // tekrar çalıştırılabilir olmalı
await db.exec(`grant all on all tables in schema public to anon, authenticated;`);
ok((await db.query(`select count(*)::int c from public.profiles`)).rows[0].c === 1, 'eski kullanıcıya profil oluşturuldu');

const A = '00000000-0000-0000-0000-00000000000a'; // işletme sahibi
const C = '00000000-0000-0000-0000-00000000000c'; // müşteri
await db.exec(`
  insert into auth.users values ('${A}', 'a@x.com', '{"full_name":"Ahmet Usta","role":"business"}');
  insert into auth.users values ('${C}', 'c@x.com', '{"full_name":"Cem","phone":"05551112233"}');
`);

const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};

// Gelecekteki bir Pazartesi (İstanbul) ve Pazar
const now = new Date();
const d = new Date(now.getTime() + 3 * 864e5);
while (d.getUTCDay() !== 1) d.setTime(d.getTime() + 864e5);
const monday = d.toISOString().slice(0, 10);
const sunday = new Date(d.getTime() + 6 * 864e5).toISOString().slice(0, 10);

const biz = (await as(A, `insert into businesses (owner_id, slug, name, city, category) values ($1, 'ahmet-berber', 'Ahmet Berber', 'İstanbul', 'berber') returning id`, [A])).rows[0].id;
ok((await db.query(`select count(*)::int c from working_hours where business_id = $1`, [biz])).rows[0].c === 7, 'varsayılan çalışma saatleri eklendi');
const staff = (await db.query(`select id, name from staff where business_id = $1`, [biz])).rows;
ok(staff.length === 1 && staff[0].name === 'Ahmet Usta', 'varsayılan personel eklendi');
ok((await db.query(`select role from profiles where id = $1`, [A])).rows[0].role === 'business', 'profil rolü business oldu');

await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'panel', 'X')`, [C]), /check constraint/, 'ayrılmış adres (panel) reddedildi');
await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'Kötü Adres', 'X')`, [C]), /check constraint/, 'geçersiz adres reddedildi');
const svc30 = (await as(A, `insert into services (business_id, name, duration_minutes, price) values ($1, 'Saç Kesimi', 30, 300) returning id`, [biz])).rows[0].id;
const svc60 = (await as(A, `insert into services (business_id, name, duration_minutes, price) values ($1, 'Saç + Sakal', 60, 450) returning id`, [biz])).rows[0].id;

const slots = async (svc, day, uid = null) =>
  (await as(uid, `select slot_start, staff_id from get_available_slots($1, $2, $3)`, [biz, svc, day])).rows;

// --- abonelik: ödeme yapılmadan işletme kapalı
ok((await slots(svc30, monday)).length === 0, 'aboneliği olmayan işletmede boş saat yok');
ok((await as(null, `select id from businesses`)).rows.length === 0, 'aboneliği olmayan işletme aramada görünmez');
await expectError(() => as(null, `select book_appointment($1, $2, null, $3, 'Cem Yılmaz', '05551112233')`, [biz, svc30, `${monday}T07:00:00Z`]), /randevu almıyor/, 'aboneliği olmayan işletme randevu almaz');
await expectError(() => as(A, `insert into staff (business_id, name) values ($1, 'Fazla')`, [biz]), /en fazla 1/, 'paketsiz işletmeye 2. personel eklenemez');
await expectError(() => as(A, `insert into appointments (business_id, service_name, customer_name, customer_phone, starts_at, ends_at) values ($1,'x','x','x',now(),now()+interval '1h')`, [biz]), /row-level security/, 'aboneliksiz işletme elle randevu giremez');

await as(A, `update businesses set subscription_ends_at = now() + interval '1 year', plan_id = 'pro' where id = $1`, [biz]);
ok((await db.query(`select subscription_ends_at from businesses where id = $1`, [biz])).rows[0].subscription_ends_at === null, 'işletme sahibi aboneliği elle uzatamaz');

await expectError(() => as(C, `select * from create_payment('esnaf')`), /Önce işletmenizi/, 'işletmesi olmayan ödeme başlatamaz');
await expectError(() => as(A, `select * from create_payment('yok')`), /Paket bulunamadı/, 'olmayan paket reddedildi');
const pay = (await as(A, `select * from create_payment('esnaf')`)).rows[0];
ok(/^SG[0-9a-f0-9]+$/i.test(pay.merchant_oid) && Number(pay.amount) === 449, `ödeme kaydı: ${pay.merchant_oid} ₺${pay.amount}`);
ok((await as(A, `select id from payments`)).rows.length === 1 && (await as(C, `select id from payments`)).rows.length === 0, 'ödemeleri sadece işletme sahibi görür');
await expectError(() => as(A, `select activate_subscription($1, 449)`, [pay.merchant_oid]), /permission denied/, 'abonelik istemciden onaylanamaz');
await expectError(() => db.query(`select activate_subscription($1, 400)`, [pay.merchant_oid]), /eksik/, 'eksik tutarla onay reddedildi');
await db.query(`select activate_subscription($1, 449)`, [pay.merchant_oid]);
const sub1 = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
const days = (sub1.subscription_ends_at - Date.now()) / 864e5;
ok(sub1.plan_id === 'esnaf' && days > 29.9 && days < 30.1, `ödeme sonrası 30 gün Esnaf paketi: ${days.toFixed(2)} gün`);
await db.query(`select activate_subscription($1, 449)`, [pay.merchant_oid]);
ok((await db.query(`select subscription_ends_at from businesses where id = $1`, [biz])).rows[0].subscription_ends_at.getTime() === sub1.subscription_ends_at.getTime(), 'tekrar gelen bildirim süreyi uzatmaz');

let s = await slots(svc30, monday);
ok(s.length === 20, `30 dk hizmet için 20 boş saat (09:00-18:30): ${s.length}`);
ok(s[0].slot_start.toISOString().endsWith('T06:00:00.000Z'), `ilk saat 09:00 İstanbul: ${s[0].slot_start.toISOString()}`);
ok((await slots(svc60, monday)).length === 19, '60 dk hizmet için 19 boş saat');
ok((await slots(svc30, sunday)).length === 0, 'Pazar kapalı');

const at10 = `${monday}T07:00:00Z`; // 10:00 İstanbul
const book = (uid, svc, t, name = 'Cem Yılmaz', phone = '0555 111 22 33') =>
  as(uid, `select book_appointment($1, $2, null, $3, $4, $5, 'not') as id`, [biz, svc, t, name, phone]);

const apptId = (await book(C, svc30, at10)).rows[0].id;
ok(!!apptId, 'müşteri randevu aldı');
await expectError(() => book(null, svc30, at10), /müsait değil/, 'aynı saate ikinci randevu reddedildi');
await expectError(() => book(null, svc60, `${monday}T06:30:00Z`), /müsait değil/, '09:30 60 dk (10:00 ile çakışır) reddedildi');
await expectError(() => book(null, svc30, `${monday}T07:10:00Z`), /müsait değil/, 'slot dışı saat reddedildi');
await expectError(() => book(null, svc30, `${monday}T08:00:00Z`, 'C', '0555'), /adınızı/, 'kısa isim reddedildi');
await expectError(() => book(null, svc30, `${monday}T08:00:00Z`, 'Cem', '0555'), /telefon/, 'geçersiz telefon reddedildi');
ok((await slots(svc30, monday)).length === 19, 'randevu sonrası 19 boş saat');
const guest = (await book(null, svc30, `${monday}T08:00:00Z`, 'Misafir Kişi')).rows[0].id;
ok(!!guest, 'misafir randevu aldı');

const appt = (await db.query(`select status, price::text, customer_id, service_name, ends_at from appointments where id = $1`, [apptId])).rows[0];
ok(appt.status === 'confirmed' && appt.price === '300.00' && appt.customer_id === C && appt.service_name === 'Saç Kesimi', 'randevu alanları doğru');

ok((await as(C, `select id from appointments`)).rows.length === 1, 'müşteri sadece kendi randevusunu görür');
ok((await as(null, `select id from appointments`)).rows.length === 0, 'anonim randevu göremez');
ok((await as(A, `select id from appointments`)).rows.length === 2, 'işletme tüm randevularını görür');
ok((await as(C, `select id from profiles`)).rows.length === 1, 'müşteri sadece kendi profilini görür');

// yetkisiz değişiklikler
await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'sahte', 'Sahte')`, [A]), /row-level security/, 'başkası adına işletme açılamaz');
ok((await as(C, `update businesses set name = 'hack' where id = $1 returning id`, [biz])).rows.length === 0, 'müşteri işletmeyi güncelleyemez');
ok((await as(C, `update appointments set status = 'completed' returning id`)).rows.length === 0, 'müşteri randevu durumunu değiştiremez');
await expectError(() => as(C, `insert into appointments (business_id, service_name, customer_name, customer_phone, starts_at, ends_at) values ($1,'x','x','x',now(),now()+interval '1h')`, [biz]), /row-level security/, 'müşteri doğrudan randevu ekleyemez');
await expectError(() => as(C, `insert into services (business_id, name, duration_minutes) values ($1, 'x', 30)`, [biz]), /row-level security/, 'müşteri hizmet ekleyemez');

// iptal
await expectError(() => as(null, `select cancel_appointment($1)`, [apptId]), /iptal edilemiyor/, 'anonim iptal edemez');
await as(C, `select cancel_appointment($1)`, [apptId]);
ok((await slots(svc30, monday)).length === 19, 'iptal sonrası saat tekrar boş (misafir hariç)');

// işletme manuel ekleme + çakışma kısıtı
await expectError(() => as(A, `insert into appointments (business_id, staff_id, service_name, customer_name, customer_phone, starts_at, ends_at) values ($1, $2, 'x', 'x', 'x', $3, $3::timestamptz + interval '30 min')`, [biz, staff[0].id, `${monday}T08:15:00Z`]), /appointments_no_overlap/, 'manuel çakışan randevu reddedildi');
ok((await as(A, `insert into appointments (business_id, staff_id, service_name, customer_name, customer_phone, starts_at, ends_at) values ($1, $2, 'x', 'x', 'x', $3, $3::timestamptz + interval '30 min') returning id`, [biz, staff[0].id, `${monday}T12:00:00Z`])).rows.length === 1, 'işletme manuel randevu ekledi');

// ikinci personel -> kapasite artar, izin düşer
const st2 = (await as(A, `insert into staff (business_id, name) values ($1, 'Mehmet') returning id`, [biz])).rows[0].id;
s = await slots(svc30, monday);
ok(s.length === 38, `2 personelle 38 (saat,personel) çifti: ${s.length}`);
// personel-hizmet eşleştirme: Mehmet sadece 60 dk hizmeti verir
await as(A, `insert into staff_services (staff_id, service_id) values ($1, $2)`, [st2, svc60]);
ok((await slots(svc30, monday)).length === 18, 'Mehmet 30 dk hizmeti vermediği için sadece 1. personelin saatleri');
ok((await slots(svc60, monday)).some((x) => x.staff_id === st2), 'Mehmet 60 dk hizmette görünür');
await expectError(() => as(C, `insert into staff_services (staff_id, service_id) values ($1, $2)`, [st2, svc30]), /row-level security/, 'müşteri personel-hizmet eşleştiremez');
ok((await as(null, `select * from staff_services`)).rows.length === 1, 'eşleştirmeler herkese açık okunur');
await as(A, `delete from staff_services where staff_id = $1`, [st2]);

// değerlendirme
const tuesday = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10);
const done = (await book(C, svc30, `${tuesday}T07:00:00Z`)).rows[0].id;
await expectError(() => as(C, `select add_review($1, 5, 'x')`, [done]), /tamamlanan/, 'tamamlanmamış randevu değerlendirilemez');
await as(A, `update appointments set status = 'completed' where id = $1`, [done]);
await expectError(() => as(null, `select add_review($1, 5, 'x')`, [done]), /tamamlanan/, 'anonim değerlendiremez');
await expectError(() => as(C, `select add_review($1, 6, 'x')`, [done]), /1 ile 5/, 'geçersiz puan reddedildi');
await as(C, `select add_review($1, 4, 'Çok memnun kaldım')`, [done]);
await expectError(() => as(C, `select add_review($1, 5, 'x')`, [done]), /zaten/, 'ikinci değerlendirme reddedildi');
let rb = (await db.query(`select rating_avg::text, rating_count from businesses where id = $1`, [biz])).rows[0];
ok(rb.rating_avg === '4.0' && rb.rating_count === 1, `işletme puanı güncellendi: ${rb.rating_avg} (${rb.rating_count})`);
const rv = (await as(null, `select customer_name, rating from reviews`)).rows;
ok(rv.length === 1 && rv[0].customer_name === 'Cem Y.', `yorum herkese açık, isim kısaltıldı: ${rv[0]?.customer_name}`);
await as(A, `update businesses set rating_avg = 1, rating_count = 99, name = 'Ahmet Berber' where id = $1`, [biz]);
rb = (await db.query(`select rating_avg::text, rating_count from businesses where id = $1`, [biz])).rows[0];
ok(rb.rating_avg === '4.0' && rb.rating_count === 1, 'işletme sahibi puanı elle değiştiremez');

// müşteri listesi
const customers = (await as(A, `select * from get_customers($1)`, [biz])).rows;
const cem = customers.find((c) => c.phone.replace(/\D/g, '').endsWith('5551112233'));
ok(cem && Number(cem.total) === 3 && Number(cem.completed) === 1 && Number(cem.cancelled) === 1 && cem.spent === '300.00',
  `aynı telefonlu randevular tek müşteri: ${JSON.stringify(cem && { t: cem.total, c: cem.completed, x: cem.cancelled, s: cem.spent })}`);
await expectError(() => as(C, `select * from get_customers($1)`, [biz]), /Yetkiniz yok/, 'başkası müşteri listesini göremez');

await as(A, `insert into time_off (business_id, staff_id, starts_at, ends_at) values ($1, $2, $3, $4)`, [biz, st2, `${monday}T06:00:00Z`, `${monday}T16:00:00Z`]);
ok((await slots(svc30, monday)).length === 18, 'personel izinli olunca kapasite düştü');
await as(A, `insert into time_off (business_id, starts_at, ends_at) values ($1, $2, $3)`, [biz, `${monday}T00:00:00Z`, `${monday}T21:00:00Z`]);
ok((await slots(svc30, monday)).length === 0, 'işletme kapalı gün');

// paket düşürme: Başlangıç (1 personel) -> fazla personel pasif olur
const pay2 = (await as(A, `select * from create_payment('baslangic')`)).rows[0];
await db.query(`select activate_subscription($1, 249)`, [pay2.merchant_oid]);
const sub2 = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
ok(sub2.plan_id === 'baslangic' && (sub2.subscription_ends_at - Date.now()) / 864e5 > 59.9, 'yeni ödeme kalan süreye eklendi (60 gün)');
ok((await db.query(`select count(*)::int c from staff where business_id = $1 and is_active`, [biz])).rows[0].c === 1, 'küçük pakete geçince fazla personel pasif oldu');
await expectError(() => as(A, `select * from get_customers($1)`, [biz]), /paketinizde yok/, 'Başlangıç paketinde müşteri defteri yok');

// yayından kaldırılan işletme
await as(A, `update businesses set is_published = false where id = $1`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 0, 'yayında olmayan işletme gizli');
ok((await as(null, `select id from services`)).rows.length === 0, 'yayında olmayan işletmenin hizmetleri gizli');
ok((await as(A, `select id from businesses`)).rows.length === 1, 'sahibi kendi işletmesini görür');

console.log(failures ? `\n${failures} TEST BAŞARISIZ` : '\nTÜM TESTLER GEÇTİ');
process.exit(failures ? 1 : 0);
