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
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
    email_confirmed_at timestamptz default now(), created_at timestamptz default now(), last_sign_in_at timestamptz);
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

// Sitenin R2'ye yüklediği görsellerin adresi (is_upload_url).
const UP = 'https://pub-2085cc7ac85a468292c6576a0f6ea8af.r2.dev/businesses/00000000-0000-0000-0000-000000000000';
const A = '00000000-0000-0000-0000-00000000000a'; // işletme sahibi
const C = '00000000-0000-0000-0000-00000000000c'; // müşteri
const G = '00000000-0000-0000-0000-00000000000f'; // telefonsuz, başka adla randevu alan müşteri (eski "misafir")
await db.exec(`
  insert into auth.users values ('${A}', 'a@x.com', '{"full_name":"Ahmet Usta","role":"business"}');
  insert into auth.users values ('${C}', 'c@x.com', '{"full_name":"Cem","phone":"05551112233"}');
  insert into auth.users values ('${G}', 'g@x.com', '{"full_name":"Gizem"}');
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

// başvuru: yeni işletme onay bekler, görünmez ve ödeme başlatamaz; deneme onayla başlar (yönetici bölümünde sınanır)
const fresh = (await db.query(`select approval_status, plan_id, subscription_ends_at, trial_ends_at from businesses where id = $1`, [biz])).rows[0];
ok(fresh.approval_status === 'pending' && fresh.plan_id === null && fresh.subscription_ends_at === null && fresh.trial_ends_at === null,
  'yeni işletme onay bekliyor, denemesi başlamadı');
ok((await as(null, `select id from businesses`)).rows.length === 0, 'onay bekleyen işletme aramada görünmez');
await expectError(() => as(A, `select * from create_payment('esnaf')`), /onaylanınca/, 'onay bekleyen işletme ödeme başlatamaz');
await as(A, `update businesses set approval_status = 'approved', trial_ends_at = now() + interval '1 year' where id = $1`, [biz]);
const self = (await db.query(`select approval_status, trial_ends_at from businesses where id = $1`, [biz])).rows[0];
ok(self.approval_status === 'pending' && self.trial_ends_at === null, 'işletme sahibi kendini onaylayamaz, deneme yazamaz');
// Ödeme kurallarını sınamak için işletme denemesiz onaylanır.
await db.query(`update businesses set approval_status = 'approved' where id = $1`, [biz]);

await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'panel', 'X')`, [C]), /check constraint/, 'ayrılmış adres (panel) reddedildi');
await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'yasal', 'X')`, [C]), /check constraint/, 'ayrılmış adres (yasal) reddedildi');
await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'esnaf', 'X')`, [C]), /check constraint/, 'ayrılmış adres (esnaf) reddedildi');
await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'Kötü Adres', 'X')`, [C]), /check constraint/, 'geçersiz adres reddedildi');
const svc30 = (await as(A, `insert into services (business_id, name, duration_minutes, price) values ($1, 'Saç Kesimi', 30, 300) returning id`, [biz])).rows[0].id;
const svc60 = (await as(A, `insert into services (business_id, name, duration_minutes, price) values ($1, 'Saç + Sakal', 60, 450) returning id`, [biz])).rows[0].id;

const slots = async (svc, day, uid = null) =>
  (await as(uid, `select slot_start, staff_id from get_available_slots($1, $2, $3)`, [biz, svc, day])).rows;

// --- abonelik: ödeme yapılmadan işletme kapalı
ok((await slots(svc30, monday)).length === 0, 'aboneliği olmayan işletmede boş saat yok');
ok((await as(null, `select id from businesses`)).rows.length === 0, 'aboneliği olmayan işletme aramada görünmez');
await expectError(() => as(C, `select book_appointment($1, $2, null, $3, 'Cem Yılmaz', '05551112233')`, [biz, svc30, `${monday}T07:00:00Z`]), /randevu almıyor/, 'aboneliği olmayan işletme randevu almaz');
await expectError(() => as(A, `insert into staff (business_id, name) values ($1, 'Fazla')`, [biz]), /en fazla 1/, 'paketsiz işletmeye 2. personel eklenemez');
await expectError(() => as(A, `insert into appointments (business_id, service_name, customer_name, customer_phone, starts_at, ends_at) values ($1,'x','x','x',now(),now()+interval '1h')`, [biz]), /row-level security/, 'aboneliksiz işletme elle randevu giremez');

await as(A, `update businesses set subscription_ends_at = now() + interval '1 year', plan_id = 'pro' where id = $1`, [biz]);
ok((await db.query(`select subscription_ends_at from businesses where id = $1`, [biz])).rows[0].subscription_ends_at === null, 'işletme sahibi aboneliği elle uzatamaz');

await expectError(() => as(C, `select * from create_payment('esnaf')`), /Önce işletmenizi/, 'işletmesi olmayan ödeme başlatamaz');
await expectError(() => as(A, `select * from create_payment('yok')`), /Paket bulunamadı/, 'olmayan paket reddedildi');
const pay = (await as(A, `select * from create_payment('esnaf')`)).rows[0];
ok(/^SG[0-9a-f0-9]+$/i.test(pay.merchant_oid) && Number(pay.amount) === 649, `ödeme kaydı: ${pay.merchant_oid} ₺${pay.amount}`);
ok((await as(A, `select id from payments`)).rows.length === 1 && (await as(C, `select id from payments`)).rows.length === 0, 'ödemeleri sadece işletme sahibi görür');
await expectError(() => as(A, `select activate_subscription($1, 649)`, [pay.merchant_oid]), /permission denied/, 'abonelik istemciden onaylanamaz');
await expectError(() => db.query(`select activate_subscription($1, 400)`, [pay.merchant_oid]), /eksik/, 'eksik tutarla onay reddedildi');
await db.query(`select activate_subscription($1, 649)`, [pay.merchant_oid]);
const sub1 = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
const days = (sub1.subscription_ends_at - Date.now()) / 864e5;
ok(sub1.plan_id === 'esnaf' && days > 29.9 && days < 30.1, `ödeme sonrası 30 gün Esnaf paketi: ${days.toFixed(2)} gün`);
await db.query(`select activate_subscription($1, 649)`, [pay.merchant_oid]);
ok((await db.query(`select subscription_ends_at from businesses where id = $1`, [biz])).rows[0].subscription_ends_at.getTime() === sub1.subscription_ends_at.getTime(), 'tekrar gelen bildirim süreyi uzatmaz');

// sayfa özelleştirme
const page = (await db.query(`select accent, announcement, whatsapp, instagram, website from businesses where id = $1`, [biz])).rows[0];
ok(page.accent === 'turkuaz' && page.announcement === '' && page.whatsapp === '' && page.instagram === '' && page.website === '', 'sayfa ayarları varsayılan');
await as(A, `update businesses set accent = 'lavanta', announcement = 'Bayramda da açığız', whatsapp = '0555 111 22 33', instagram = 'ahmet.berber', website = 'https://ahmetberber.com' where id = $1`, [biz]);
ok((await db.query(`select accent, instagram from businesses where id = $1`, [biz])).rows[0].instagram === 'ahmet.berber', 'işletme sahibi sayfa ayarlarını güncelledi');
for (const [sql, label] of [
  [`accent = 'mor'`, 'listede olmayan renk'],
  [`announcement = repeat('a', 161)`, '160 karakterden uzun duyuru'],
  [`instagram = '@ahmet'`, '@ işaretli Instagram adı'],
  [`website = 'ahmetberber.com'`, 'http(s) olmayan web adresi'],
  [`whatsapp = 'numara'`, 'harf içeren WhatsApp numarası'],
]) await expectError(() => as(A, `update businesses set ${sql} where id = $1`, [biz]), /check constraint/, `${label} reddedildi`);
const feats = Object.fromEntries((await db.query(`select id, features from plans`)).rows.map((r) => [r.id, r.features]));
ok(feats.baslangic.length === 0 && feats.esnaf.includes('announcement') && feats.esnaf.includes('links') && !feats.esnaf.includes('theme') && feats.pro.includes('theme'),
  'duyuru ve kısayollar Esnaf, sayfa rengi Pro paketinde');
const hasFeature = async (f) => (await db.query(`select plan_has_feature($1, $2) v`, [biz, f])).rows[0].v;
ok(await hasFeature('links') && await hasFeature('announcement') && !(await hasFeature('theme')), 'Esnaf işletmesinde kısayol ve duyuru açık, sayfa rengi kapalı');
await as(A, `update businesses set accent = 'turkuaz', announcement = '', whatsapp = '', instagram = '', website = '' where id = $1`, [biz]);

let s = await slots(svc30, monday);
ok(s.length === 20, `30 dk hizmet için 20 boş saat (09:00-18:30): ${s.length}`);
ok(s[0].slot_start.toISOString().endsWith('T06:00:00.000Z'), `ilk saat 09:00 İstanbul: ${s[0].slot_start.toISOString()}`);
ok((await slots(svc60, monday)).length === 19, '60 dk hizmet için 19 boş saat');
ok((await slots(svc30, sunday)).length === 0, 'Pazar kapalı');

const at10 = `${monday}T07:00:00Z`; // 10:00 İstanbul
const book = (uid, svc, t, name = 'Cem Yılmaz', phone = '0555 111 22 33') =>
  as(uid, `select b->>'id' as id, b->>'status' as status from book_appointment($1, $2, null, $3, $4, $5, 'not') b`, [biz, svc, t, name, phone]);

const apptId = (await book(C, svc30, at10)).rows[0].id;
ok(!!apptId, 'müşteri randevu aldı');
await expectError(() => book(G, svc30, at10), /müsait değil/, 'aynı saate ikinci randevu reddedildi');
await expectError(() => book(G, svc60, `${monday}T06:30:00Z`), /müsait değil/, '09:30 60 dk (10:00 ile çakışır) reddedildi');
await expectError(() => book(G, svc30, `${monday}T07:10:00Z`), /müsait değil/, 'slot dışı saat reddedildi');
await expectError(() => book(G, svc30, `${monday}T08:00:00Z`, 'C', '0555'), /adınızı/, 'kısa isim reddedildi');
await expectError(() => book(G, svc30, `${monday}T08:00:00Z`, 'Cem', '0555'), /telefon/, 'geçersiz telefon reddedildi');
ok((await slots(svc30, monday)).length === 19, 'randevu sonrası 19 boş saat');
const guest = (await book(G, svc30, `${monday}T08:00:00Z`, 'Misafir Kişi')).rows[0].id;
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

// e-posta bildirimleri
const notes = async (id) =>
  (await db.query(`select kind, recipient, email from notifications where appointment_id = $1 order by kind, recipient`, [id])).rows
    .map((r) => `${r.kind}:${r.recipient}:${r.email}`).join(' ');
let n = await notes(apptId);
ok(n === 'booked:business:a@x.com booked:customer:c@x.com cancelled:business:a@x.com', `girişli müşteri: hesap e-postasına bildirim, iptali işletmeye: ${n}`);
ok(await notes(guest) === 'booked:business:a@x.com booked:customer:g@x.com', 'e-posta yazmayan müşteriye hesap e-postasından bildirim');
ok((await db.query(`select count(*)::int c from notifications n join appointments a on a.id = n.appointment_id where a.customer_name = 'x'`)).rows[0].c === 0, 'işletmenin elle eklediği randevuya bildirim yok');
ok((await as(A, `select id from notifications`)).rows.length === 0 && (await as(C, `select id from notifications`)).rows.length === 0, 'bildirim kuyruğu istemciye kapalı');

const wednesday = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 2 * 864e5).toISOString().slice(0, 10);
const bookMail = (t, email) =>
  as(G, `select b->>'id' as id from book_appointment($1, $2, null, $3, 'Misafir Kişi', '05551112244', '', $4) b`, [biz, svc30, t, email]);
await as(A, `update businesses set auto_confirm = false where id = $1`, [biz]);
const mailed = (await bookMail(`${wednesday}T06:00:00Z`, 'kurban@ornek.com')).rows[0].id;
ok((await db.query(`select customer_email from appointments where id = $1`, [mailed])).rows[0].customer_email === 'g@x.com',
  'istemcinin yazdığı e-posta yok sayıldı, hesap adresi kaydedildi (başkasının kutusuna e-posta gönderilemez)');
await as(A, `update appointments set status = 'confirmed' where id = $1`, [mailed]);
await as(A, `update appointments set status = 'cancelled' where id = $1`, [mailed]);
await as(A, `update businesses set auto_confirm = true where id = $1`, [biz]);
n = await notes(mailed);
ok(n === 'booked:business:a@x.com booked:customer:g@x.com cancelled:customer:g@x.com confirmed:customer:g@x.com',
  `onay ve işletmenin iptali müşteriye gider: ${n}`);

// hatırlatma: elle (servis olarak) eklenen yakın randevular
const remind = (startsIn, createdAgo, email = 'r@x.com') =>
  db.query(`insert into appointments (business_id, service_name, customer_name, customer_phone, customer_email, starts_at, ends_at, status, created_at)
            values ($1, 'Saç Kesimi', 'Rıza', '05550000000', $2, now() + $3::interval, now() + $3::interval + interval '30 min', 'confirmed', now() - $4::interval) returning id`,
    [biz, email, startsIn, createdAgo]).then((r) => r.rows[0].id);
const r24 = await remind('20 hours', '2 days');
const r2 = await remind('90 minutes', '2 hours');
const rSoon = await remind('5 hours', '10 hours'); // 24 saatten kısa kala alındı, 2 saat kala hatırlatılacak
const rLate = await remind('150 minutes', '0 minutes'); // 3 saatten az kala alındı
await remind('20 hours', '2 days', null);
await expectError(() => as(A, `select queue_due_reminders()`), /permission denied/, 'hatırlatma kuyruğu istemciden çalıştırılamaz');
ok((await db.query(`select queue_due_reminders() c`)).rows[0].c === 2, 'zamanı gelen 2 hatırlatma kuyruğa girdi');
ok((await db.query(`select queue_due_reminders() c`)).rows[0].c === 0, 'hatırlatma ikinci kez eklenmez');
const hasReminder = async (id) => (await notes(id)).includes('reminder:customer:r@x.com');
const hasSoon = async (id) => (await notes(id)).includes('reminder_soon:customer:r@x.com');
ok(await hasReminder(r24) && !(await hasSoon(r24)) && await hasSoon(r2) && !(await hasReminder(r2))
  && !(await hasReminder(rSoon)) && !(await hasSoon(rSoon)) && !(await hasReminder(rLate)) && !(await hasSoon(rLate)),
  'hatırlatma zamanlaması doğru: 1 gün kala ve 2 saat kala');
const r2b = await remind('90 minutes', '2 days');
await db.query(`insert into appointment_reminders (appointment_id, stage) values ($1, 1)`, [r2b]);
ok((await db.query(`select queue_due_reminders() c`)).rows[0].c === 1 && await hasSoon(r2b) && !(await hasReminder(r2b)),
  '1 günlük hatırlatması gitmiş randevuya 2 saat kala ikincisi gitti');
ok((await as(C, `select * from appointment_reminders`)).rows.length === 0, 'hatırlatma kayıtları istemciye kapalı');
await db.query(`update appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = $1`, [r24]);
ok(!(await hasReminder(r24)) && (await db.query(`select count(*)::int c from appointment_reminders where appointment_id = $1`, [r24])).rows[0].c === 0,
  'saati değişen randevunun hatırlatmaları sıfırlandı');
ok((await db.query(`select queue_due_reminders() c`)).rows[0].c === 1 && await hasReminder(r24), 'yeni saat için hatırlatma tekrar kuyruğa girdi');

// gönderim
await expectError(() => as(A, `select * from claim_notifications()`), /permission denied/, 'kuyruk istemciden alınamaz');
const claimed = (await db.query(`select * from claim_notifications(100)`)).rows;
const skipped = (await db.query(`select kind, status from notifications where appointment_id = $1 order by kind, recipient`, [apptId])).rows.map((r) => r.status).join(',');
ok(skipped === 'skipped,skipped,pending' && !claimed.some((c) => c.kind !== 'cancelled' && c.status === 'cancelled'), `iptal edilen randevunun "alındı" e-postası atlandı, iptal e-postası gider: ${skipped}`);
const rc = claimed.find((c) => c.kind === 'reminder' && c.email === 'r@x.com');
ok(rc && rc.business_name === 'Ahmet Berber' && rc.business_slug === 'ahmet-berber' && rc.service_name === 'Saç Kesimi', 'e-posta için randevu ve işletme bilgisi geldi');
ok((await db.query(`select * from claim_notifications(100)`)).rows.length === 0, 'alınan e-postalar kilitli, ikinci istek almaz');
await db.query(`select finish_notification($1, 'Resend 500')`, [rc.id]);
await db.query(`select finish_notification($1)`, [claimed[0].id]);
const st = (await db.query(`select id, status, attempts, last_error from notifications where id = any($1)`, [[rc.id, claimed[0].id]])).rows;
ok(st.find((x) => x.id === rc.id).status === 'pending' && st.find((x) => x.id === rc.id).last_error === 'Resend 500', 'hatalı gönderim tekrar denenecek');
ok(st.find((x) => x.id === claimed[0].id).status === 'sent', 'başarılı gönderim işaretlendi');
await db.query(`update notifications set attempts = 5 where id = $1`, [rc.id]);
await db.query(`select finish_notification($1, 'Resend 500')`, [rc.id]);
ok((await db.query(`select status from notifications where id = $1`, [rc.id])).rows[0].status === 'failed', '5 denemeden sonra bırakıldı');
await db.query(`delete from appointments where customer_name = 'Rıza'`);

// uygulama içi bildirimler: işlemi yapana değil, karşı tarafa
const asService = (sql, params) =>
  db.exec(`select set_config('request.jwt.claim.sub', '', false)`).then(() => db.query(sql, params));
const inbox = async (uid) =>
  (await as(uid, `select id, kind, title, body, read_at from inbox`)).rows;
const kinds = (rows) => rows.map((r) => `${r.kind}:${r.title}`).sort().join(' | ');
const when = (iso) =>
  `${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(iso))}, ` +
  new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

let ib = await inbox(A);
ok(kinds(ib) === 'booked:Onay bekleyen randevu | booked:Yeni randevu | booked:Yeni randevu | cancelled:Randevu iptal edildi',
  `işletmeye: müşteri ve misafir randevuları, müşterinin iptali; kendi eklediği yok: ${kinds(ib)}`);
ok(ib.some((r) => r.body === `Cem Yılmaz · Saç Kesimi · ${when(at10)}`), `işletme bildirimi metni: ${ib[0]?.body}`);
ok((await inbox(C)).length === 0, 'müşteriye kendi aldığı ve iptal ettiği randevu için bildirim yok');
ok((await inbox(null)).length === 0, 'anonim bildirim göremez');

const thursday = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 3 * 864e5).toISOString().slice(0, 10);
await as(A, `update businesses set auto_confirm = false where id = $1`, [biz]);
const pend = (await book(C, svc30, `${thursday}T07:00:00Z`)).rows[0].id;
await as(A, `update businesses set auto_confirm = true where id = $1`, [biz]);
await as(A, `update appointments set status = 'confirmed' where id = $1`, [pend]);
await as(A, `update appointments set status = 'cancelled' where id = $1`, [pend]);
ib = await inbox(C);
ok(kinds(ib) === 'cancelled:Randevunuz iptal edildi | confirmed:Randevunuz onaylandı'
  && ib.every((r) => r.body === `Ahmet Berber · Saç Kesimi · ${when(`${thursday}T07:00:00Z`)}`),
  `işletmenin onayı ve iptali müşteriye: ${kinds(ib)} / ${ib[0]?.body}`);

await expectError(() => as(C, `insert into inbox (user_id, appointment_id, kind, recipient, title, body) values ($1, $2, 'booked', 'customer', 'x', 'x')`, [C, pend]),
  /row-level security/, 'müşteri kendine bildirim ekleyemez');
ok((await as(C, `update inbox set read_at = now() returning id`)).rows.length === 0, 'bildirim doğrudan güncellenemez');
await as(A, `select mark_inbox_read()`);
ok((await inbox(C)).every((r) => r.read_at === null), 'başkası müşterinin bildirimini okundu yapamaz');
await as(C, `select mark_inbox_read($1)`, [ib[0].id]);
ok((await inbox(C)).filter((r) => r.read_at).length === 1, 'tek bildirim okundu yapıldı');
await as(C, `select mark_inbox_read()`);
ok((await inbox(C)).every((r) => r.read_at), 'hepsi okundu yapıldı');
ok((await inbox(A)).every((r) => r.read_at), 'işletme kendi bildirimlerini okundu yaptı');

// işletme elle eklediği randevuyu müşteri hesabına veya e-postaya bağlayamaz (başkasına bildirim/e-posta gidemez)
const forged = (await as(A, `insert into appointments (business_id, customer_id, customer_email, service_name, customer_name, customer_phone, starts_at, ends_at, status)
  values ($1, $2, 'kurban@ornek.com', 'Saç Kesimi', 'Cem Yılmaz', '05559990000', now() + interval '30 hours', now() + interval '30 hours 30 minutes', 'confirmed')
  returning id, customer_id, customer_email`, [biz, C])).rows[0];
ok(forged.customer_id === null && forged.customer_email === null, 'elle eklenen randevu müşteri hesabına ve e-postaya bağlanamadı');
ok(!(await inbox(C)).some((r) => r.kind === 'booked'), 'elle eklenen randevu müşteriye bildirim göndermedi');
await as(A, `update appointments set customer_id = $2, customer_email = 'kurban@ornek.com' where id = $1`, [forged.id, C]);
const forgedAfter = (await db.query(`select customer_id, customer_email from appointments where id = $1`, [forged.id])).rows[0];
ok(forgedAfter.customer_id === null && forgedAfter.customer_email === null, 'randevunun hesabı ve e-postası sonradan değiştirilemez');
await db.query(`delete from appointments where id = $1`, [forged.id]);

// müşteri hesabına bağlı randevu (işletme adına çalışan fonksiyonun yazdığı gibi); hatırlatması da uygulama içi bildirim olarak gider
await db.exec(`select set_config('request.jwt.claim.sub', '${A}', false)`);
const remindC = (await db.query(`insert into appointments (business_id, customer_id, service_name, customer_name, customer_phone, starts_at, ends_at, status, created_at)
  values ($1, $2, 'Saç Kesimi', 'Cem Yılmaz', '05559990000', now() + interval '20 hours', now() + interval '20 hours 30 minutes', 'confirmed', now() - interval '2 days') returning id`, [biz, C])).rows[0].id;
await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
ok((await inbox(C)).some((r) => r.kind === 'booked' && r.title === 'Randevunuz onaylandı'), 'işletmenin eklediği randevu müşteriye bildirildi');
ok((await asService(`select queue_due_reminders() c`)).rows[0].c === 1, 'e-postasız girişli müşteriye hatırlatma kuyruğa girdi');
ok((await inbox(C)).some((r) => r.kind === 'reminder' && r.title === 'Randevunuz yaklaşıyor'), 'hatırlatma bildirimi müşteride');

// telefon adresleri
await expectError(() => as(null, `select register_push_token('ExponentPushToken[anon]', 'android')`), /Giriş yapmalısınız/, 'anonim telefon kaydedemez');
await expectError(() => as(C, `select register_push_token('kotu-adres', 'android')`), /check constraint/, 'geçersiz push adresi reddedildi');
await as(A, `select register_push_token('ExponentPushToken[aaa]', 'android')`);
await as(A, `select register_push_token('ExponentPushToken[ortak]', 'android')`);
await as(C, `select register_push_token('ExponentPushToken[ortak]', 'ios')`);
const owners = async () => Object.fromEntries((await db.query(`select token, user_id from push_tokens`)).rows.map((r) => [r.token, r.user_id]));
let tk = await owners();
ok(tk['ExponentPushToken[aaa]'] === A && tk['ExponentPushToken[ortak]'] === C, 'aynı telefonda hesap değişince adres yeni hesaba geçti');
ok((await as(C, `select token from push_tokens`)).rows.length === 0, 'push adresleri istemciye kapalı');
await as(A, `select unregister_push_token('ExponentPushToken[ortak]')`);
ok((await owners())['ExponentPushToken[ortak]'] === C, 'başkasının adresi silinemez');

// push gönderimi
await expectError(() => as(A, `select * from claim_push()`), /permission denied/, 'push kuyruğu istemciden alınamaz');
await expectError(() => as(A, `select drop_push_tokens(array['ExponentPushToken[ortak]'])`), /permission denied/, 'push adresi istemciden toplu silinemez');
const pushes = (await asService(`select * from claim_push(100)`)).rows;
const pk = pushes.map((p) => `${p.recipient}:${p.kind}:${p.tokens.join(',')}`).sort().join(' | ');
ok(pk === 'business:booked:ExponentPushToken[aaa] | business:cancelled:ExponentPushToken[aaa] | customer:booked:ExponentPushToken[ortak] | customer:cancelled:ExponentPushToken[ortak] | customer:reminder:ExponentPushToken[ortak]',
  `iptal edilen randevunun eski bildirimleri atlandı, kalanlar telefon adresleriyle geldi: ${pk}`);
ok((await asService(`select * from claim_push(100)`)).rows.length === 0, 'alınan pushlar kilitli, ikinci istek almaz');
const [p1, p2] = pushes;
await asService(`select finish_push($1, 'Expo 500')`, [p1.id]);
await asService(`select finish_push($1)`, [p2.id]);
const ps = Object.fromEntries((await db.query(`select id, push_status from inbox where id = any($1)`, [[p1.id, p2.id]])).rows.map((r) => [r.id, r.push_status]));
ok(ps[p1.id] === 'pending' && ps[p2.id] === 'sent', 'hatalı push tekrar denenecek, başarılı işaretlendi');
await db.query(`update inbox set push_attempts = 5 where id = $1`, [p1.id]);
await asService(`select finish_push($1, 'Expo 500')`, [p1.id]);
ok((await db.query(`select push_status from inbox where id = $1`, [p1.id])).rows[0].push_status === 'failed', '5 denemeden sonra push bırakıldı');

await asService(`select drop_push_tokens(array['ExponentPushToken[aaa]'])`);
const later = (await book(G, svc30, `${thursday}T09:00:00Z`, 'Misafir Kişi')).rows[0].id;
ok((await asService(`select * from claim_push(100)`)).rows.length === 0
  && (await db.query(`select push_status from inbox where appointment_id = $1`, [later])).rows[0].push_status === 'skipped',
  'telefonu kayıtlı olmayan kullanıcının push\'u atlandı');
await as(C, `select unregister_push_token('ExponentPushToken[ortak]')`);
ok(Object.keys(await owners()).length === 0, 'çıkışta adres silindi');
await db.query(`delete from appointments where id = any($1)`, [[pend, remindC, later]]);

// randevu erteleme
const friday = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 4 * 864e5).toISOString().slice(0, 10);
const mv = (await book(C, svc30, `${thursday}T07:00:00Z`)).rows[0].id; // 10:00
const other = (await book(G, svc30, `${thursday}T08:00:00Z`, 'Misafir Kişi')).rows[0].id; // 11:00
const resched = (uid, id, t) => as(uid, `select reschedule_appointment($1, $2)`, [id, t]);
const thu = async (uid, ignore = null) =>
  (await as(uid, `select slot_start from get_available_slots($1, $2, $3, null, $4)`, [biz, svc30, thursday, ignore])).rows.map((r) => r.slot_start.toISOString());
const at = (day, hm) => `${day}T${hm}:00.000Z`;
ok((await thu(C, mv)).includes(at(thursday, '07:00')) && !(await thu(C)).includes(at(thursday, '07:00'))
  && !(await thu(null, mv)).includes(at(thursday, '07:00')) && !(await thu(C, other)).includes(at(thursday, '08:00')),
  'ertelenen randevunun saati sadece müşterisine boş görünür');
await expectError(() => resched(null, mv, at(thursday, '09:00')), /değiştirilemiyor/, 'anonim erteleyemez');
await expectError(() => resched(C, other, at(thursday, '09:00')), /değiştirilemiyor/, 'müşteri başkasının randevusunu erteleyemez');
await expectError(() => resched(C, mv, at(thursday, '08:00')), /müsait değil/, 'dolu saate ertelenemez');
await expectError(() => resched(C, mv, at(thursday, '09:10')), /müsait değil/, 'slot dışı saate ertelenemez');
const apptAt = async (id) => (await db.query(`select starts_at, ends_at, status from appointments where id = $1`, [id])).rows[0];
await resched(C, mv, at(thursday, '07:30'));
let moved = await apptAt(mv);
ok(moved.starts_at.toISOString() === at(thursday, '07:30') && moved.ends_at - moved.starts_at === 30 * 6e4 && moved.status === 'confirmed',
  'müşteri randevuyu kendi saatiyle çakışan yarım saat sonraya aldı');
ok((await thu(null)).includes(at(thursday, '07:00')), 'eski saat boşaldı');
ok((await notes(mv)).includes('rescheduled:business:a@x.com'), 'müşterinin ertelemesi işletmeye e-postayla gider');
await resched(C, mv, at(thursday, '10:00'));
ib = (await inbox(A)).filter((r) => r.kind === 'rescheduled');
ok(ib.length === 1 && ib[0].title === 'Randevu saati değişti' && ib[0].body === `Cem Yılmaz · Saç Kesimi · ${when(at(thursday, '10:00'))}`,
  `ikinci ertelemede işletmenin bildirimi yeni saatle yenilendi: ${ib.map((r) => r.body).join(' | ')}`);
ok(!(await inbox(C)).some((r) => r.kind === 'rescheduled'), 'erteleyen müşteriye kendi işlemi bildirilmez');

await resched(A, mv, at(friday, '07:00'));
ok((await inbox(C)).some((r) => r.kind === 'rescheduled' && r.title === 'Randevunuzun saati değişti' && r.body.endsWith(when(at(friday, '07:00'))))
  && (await notes(mv)).includes('rescheduled:customer:c@x.com'), 'işletmenin ertelemesi müşteriye bildirildi');
await resched(A, other, at(friday, '08:00'));
ok((await apptAt(other)).starts_at.toISOString() === at(friday, '08:00'), 'işletme misafir randevusunu erteledi');

await as(A, `update businesses set auto_confirm = false where id = $1`, [biz]);
await resched(C, mv, at(friday, '09:00'));
ok((await apptAt(mv)).status === 'pending' && (await inbox(A)).some((r) => r.kind === 'rescheduled' && r.title === 'Saat değişikliği onay bekliyor'),
  'elle onaylayan işletmede müşterinin ertelediği randevu yeniden onay bekler');
await as(A, `update appointments set status = 'confirmed' where id = $1`, [mv]);
ok((await inbox(C)).some((r) => r.kind === 'confirmed' && r.body.endsWith(when(at(friday, '09:00')))), 'yeni saatin onayı müşteriye bildirildi');
await as(A, `update businesses set auto_confirm = true where id = $1`, [biz]);

await db.query(`update appointments set service_id = null where id = $1`, [other]);
await expectError(() => resched(A, other, at(friday, '10:00')), /artık sunulmuyor/, 'silinen hizmetin randevusu ertelenemez');
await as(C, `select cancel_appointment($1)`, [mv]);
await expectError(() => resched(C, mv, at(friday, '10:00')), /değiştirilemiyor/, 'iptal edilen randevu ertelenemez');
await db.query(`delete from appointments where id = any($1)`, [[mv, other]]);

// sık iptal eden müşteri: son 6 ayda 3 iptal veya 2 gelmeme
const nextMon = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 7 * 864e5).toISOString().slice(0, 10);
const row = async (id) => (await db.query(`select status, cancelled_by, prior_cancels, prior_no_shows, customer_flagged from appointments where id = $1`, [id])).rows[0];
const c2 = (await book(C, svc30, `${nextMon}T06:00:00Z`)).rows[0].id;
const c3 = (await book(C, svc30, `${nextMon}T06:30:00Z`)).rows[0].id;
await as(C, `select cancel_appointment($1)`, [c2]);
await as(C, `select cancel_appointment($1)`, [c3]);
ok((await row(c2)).cancelled_by === 'customer' && (await row(apptId)).cancelled_by === 'customer', 'müşterinin iptali "customer" olarak kaydedildi');
const fl = (await book(C, svc30, `${nextMon}T07:00:00Z`)).rows[0];
const flRow = await row(fl.id);
ok(fl.status === 'pending' && flRow.prior_cancels === 3 && flRow.prior_no_shows === 0 && flRow.customer_flagged,
  `3 kez iptal eden müşterinin randevusu işaretli ve işletme onayına düştü: ${JSON.stringify(flRow)} / dönen ${fl.status}`);
ib = (await inbox(A)).filter((r) => r.title === 'Dikkat: sık iptal eden müşteri');
ok(ib.length === 1 && ib[0].body.includes('Son 6 ayda 3 iptal, 0 gelmedi') && ib[0].body.endsWith('Onayınızı bekliyor'),
  `işletmeye uyarılı bildirim: ${ib[0]?.body}`);
const flGuest = (await book(G, svc30, `${nextMon}T08:00:00Z`, 'Cem Başka', '+90 555 111 22 33')).rows[0];
ok(flGuest.status === 'confirmed' && !(await row(flGuest.id)).customer_flagged,
  'başka hesabın aynı telefonla randevusu işaretlenmez (telefon doğrulanmıyor: başkasının numarasıyla iptal edip onu lekeleyemez)');
await as(A, `update appointments set status = 'cancelled' where id = $1`, [flGuest.id]);
ok((await row(flGuest.id)).cancelled_by === 'business', 'işletmenin iptali "business" olarak kaydedildi');
await as(A, `update appointments set customer_flagged = false, prior_cancels = 0, cancelled_by = 'customer' where id = $1`, [fl.id]);
const kept = await row(fl.id);
ok(kept.customer_flagged && kept.prior_cancels === 3 && kept.cancelled_by === null, 'işaret ve geçmiş sayıları elle değiştirilemez');
await expectError(() => as(A, `select * from customer_history($1, '05551112233', $2)`, [C, biz]), /permission denied/, 'başkasının geçmişi sorgulanamaz');
const flMail = (await db.query(`select * from claim_notifications(100)`)).rows.find((n) => n.recipient === 'business' && n.kind === 'booked' && n.customer_name === 'Cem Yılmaz' && n.customer_flagged);
ok(flMail && flMail.prior_cancels === 3, 'işletme e-postası uyarı bilgisiyle kuyruktan alındı');

// işletmenin iptalleri sayılmaz, gelmemeler sayılır
const noShowPhone = '0532 123 45 67';
const manual = (t, status) => as(A, `insert into appointments (business_id, staff_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
  values ($1, $2, 'Saç Kesimi', 'Gelmeyen', $3, $4, $4::timestamptz + interval '30 min', $5) returning id`, [biz, staff[0].id, noShowPhone, t, status]).then((r) => r.rows[0].id);
const m1 = await manual(`${nextMon}T09:00:00Z`, 'cancelled');
const m2 = await manual(`${nextMon}T09:30:00Z`, 'cancelled');
const m3 = await manual(`${nextMon}T10:00:00Z`, 'cancelled');
let gl = (await book(G, svc30, `${nextMon}T11:00:00Z`, 'Gelmeyen', noShowPhone)).rows[0];
ok(gl.status === 'confirmed' && !(await row(gl.id)).customer_flagged, 'işletmenin iptal ettiği randevular müşteriye yazılmaz');
await as(A, `update appointments set status = 'no_show' where id = any($1)`, [[m1, m2]]);
const autoBlock = (await as(A, `select customer_id, phone_key, customer_name from blocked_customers`)).rows;
ok(autoBlock.length === 1 && autoBlock[0].phone_key === '5321234567' && autoBlock[0].customer_name === 'Gelmeyen',
  `2 kez gelmeyen müşteri otomatik engellendi: ${JSON.stringify(autoBlock)}`);
await expectError(() => book(G, svc30, `${nextMon}T11:30:00Z`, 'Gelmeyen', noShowPhone), /alamıyorsunuz/, 'otomatik engellenen müşteri randevu alamaz');
await as(A, `update appointments set status = 'cancelled' where id = $1`, [m3]);
await as(A, `update appointments set status = 'no_show' where id = $1`, [m3]);
ok((await db.query(`select count(*)::int c from blocked_customers`)).rows[0].c === 1, 'engel ikinci kez eklenmez');
await as(A, `delete from blocked_customers`);
await db.query(`update appointments set status = 'cancelled' where id = $1`, [m3]);
const gl2 = (await book(G, svc30, `${nextMon}T11:30:00Z`, 'Gelmeyen', noShowPhone)).rows[0];
const gl2Row = await row(gl2.id);
ok(gl2.status === 'pending' && gl2Row.prior_no_shows === 2 && gl2Row.customer_flagged, `2 kez gelmeyen müşteri işaretli: ${JSON.stringify(gl2Row)}`);
await db.query(`delete from appointments where id = any($1)`, [[c2, c3, fl.id, flGuest.id, m1, m2, m3, gl.id, gl2.id]]);

// sahte randevu koruması: giriş zorunlu, sınırlar, engelleme
const nextTue = new Date(new Date(`${nextMon}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10);
const tue = (hm) => `${nextTue}T${hm}:00Z`;
await expectError(() => book(null, svc30, tue('06:00')), /giriş yapın/, 'giriş yapmayan randevu alamaz');
const lim = [];
for (const hm of ['06:00', '06:30']) lim.push((await book(G, svc30, tue(hm), 'Gizem', '0544 000 00 01')).rows[0].id);
ok((await db.query(`select count(*)::int c from appointments where customer_id = $1 and status in ('pending', 'confirmed') and starts_at > now()`, [G])).rows[0].c === 3, 'müşterinin 3 yaklaşan randevusu var');
await expectError(() => book(G, svc30, tue('07:00'), 'Gizem', '0544 000 00 01'), /en fazla 3/, 'aynı işletmede 4. yaklaşan randevu reddedildi');
await as(G, `select cancel_appointment($1)`, [lim[1]]);
await db.query(`insert into appointments (business_id, customer_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
  select $1, $2, 'x', 'x', '0544 000 00 01', now() - make_interval(days => 30 + g), now() - make_interval(days => 30 + g) + interval '30 min', 'completed'
  from generate_series(1, 10) g`, [biz, G]);
await expectError(() => book(G, svc30, tue('07:00'), 'Gizem', '0544 000 00 01'), /24 saatte/, '24 saatte 10 randevudan fazlası reddedildi');
await db.query(`delete from appointments where customer_id = $1 and service_name = 'x'`, [G]);

await expectError(() => as(C, `select block_customer($1)`, [lim[0]]), /bulunamadı/, 'müşteri başkasını engelleyemez');
ok((await as(A, `select block_customer($1) n`, [lim[0]])).rows[0].n === 2, 'işletme müşteriyi engelledi, 2 yaklaşan randevusu iptal oldu');
ok((await row(lim[0])).status === 'cancelled' && (await row(guest)).status === 'cancelled', 'engellenen müşterinin randevuları iptal');
await as(A, `select block_customer($1)`, [lim[0]]);
const blocks = (await as(A, `select customer_id, phone_key, customer_name from blocked_customers`)).rows;
ok(blocks.length === 1 && blocks[0].customer_id === G && blocks[0].phone_key === '5440000001', `engel tek kayıt, hesap + telefon: ${JSON.stringify(blocks)}`);
ok((await as(C, `select id from blocked_customers`)).rows.length === 0 && (await as(G, `select id from blocked_customers`)).rows.length === 0, 'engel listesini sadece işletme görür');
await expectError(() => as(A, `insert into blocked_customers (business_id, customer_id) values ($1, $2)`, [biz, C]), /row-level security/, 'engel doğrudan eklenemez');
await expectError(() => book(G, svc30, tue('07:00'), 'Gizem', '0555 999 99 99'), /alamıyorsunuz/, 'engellenen hesap randevu alamaz');
await expectError(() => book(C, svc30, tue('07:00'), 'Cem', '+90 544 000 00 01'), /alamıyorsunuz/, 'engellenen telefonla başka hesap da alamaz');
await as(A, `delete from blocked_customers`);
// Sonraki testler misafir randevusunun açık olmasını bekler.
await db.query(`update appointments set status = 'confirmed' where id = $1`, [guest]);
const unblocked = (await book(G, svc30, tue('07:00'), 'Gizem', '0544 000 00 01')).rows[0].id;
ok(!!unblocked, 'engel kalkınca randevu alındı');

await db.query(`delete from appointments where id = any($1)`, [[...lim, unblocked]]);

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

// personelin kendi saatleri (İstanbul 13:00-15:00 = 10:00-12:00 UTC), kapalı gün, yetki
await as(A, `insert into staff_hours (staff_id, weekday, open_time, close_time) values ($1, 1, '13:00', '15:00')`, [st2]);
let own = (await slots(svc30, monday)).filter((x) => x.staff_id === st2).map((x) => x.slot_start.toISOString().slice(11, 16));
ok(own.join() === '10:00,10:30,11:00,11:30', `Mehmet yalnızca kendi saatlerinde: ${own.join()}`);
await as(A, `update staff_hours set is_open = false where staff_id = $1`, [st2]);
ok(!(await slots(svc30, monday)).some((x) => x.staff_id === st2), 'Mehmet o gün izinli, saati görünmez');
ok((await slots(svc30, monday)).some((x) => x.staff_id === staff[0].id), 'diğer personel işletme saatleriyle devam eder');
await expectError(() => as(C, `insert into staff_hours (staff_id, weekday) values ($1, 2)`, [st2]), /row-level security/, 'müşteri personel saati ekleyemez');
ok((await as(null, `select * from staff_hours`)).rows.length === 1, 'personel saatleri herkese açık okunur');
await as(A, `delete from staff_hours where staff_id = $1`, [st2]);

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
ok(Number((await db.query(`select rating_score from businesses where id = $1`, [biz])).rows[0].rating_score) === 4, 'tek 4 yıldızlı işletmenin sıralama puanı 4,0');
await expectError(() => as(A, `update businesses set rating_score = 5 where id = $1`, [biz]), /rating_score/, 'sıralama puanı elle yazılamaz');

// müşteri listesi
const customers = (await as(A, `select * from get_customers($1)`, [biz])).rows;
const cem = customers.find((c) => c.phone.replace(/\D/g, '').endsWith('5551112233'));
ok(cem && Number(cem.total) === 3 && Number(cem.completed) === 1 && Number(cem.cancelled) === 1 && cem.spent === '300.00',
  `aynı telefonlu randevular tek müşteri: ${JSON.stringify(cem && { t: cem.total, c: cem.completed, x: cem.cancelled, s: cem.spent })}`);
await expectError(() => as(C, `select * from get_customers($1)`, [biz]), /Yetkiniz yok/, 'başkası müşteri listesini göremez');

// müşteri notu: yalnızca işletme
await as(A, `insert into customer_notes (business_id, phone_key, note) values ($1, '5551112233', 'Kısa kesim sever')`, [biz]);
ok((await as(A, `select note from customer_notes`)).rows[0]?.note === 'Kısa kesim sever', 'işletme müşteri notu yazdı');
ok((await as(C, `select * from customer_notes`)).rows.length === 0 && (await as(null, `select * from customer_notes`)).rows.length === 0, 'notu müşteri ve ziyaretçi göremez');
await expectError(() => as(C, `insert into customer_notes (business_id, phone_key) values ($1, '5550000000')`, [biz]), /row-level security/, 'başkası not yazamaz');
await expectError(() => as(A, `insert into customer_notes (business_id, phone_key) values ($1, '555')`, [biz]), /check constraint/, 'geçersiz telefon anahtarı reddedildi');

// favoriler: müşteri yalnızca kendi listesini görür ve yönetir
await as(C, `insert into favorites (customer_id, business_id) values ($1, $2)`, [C, biz]);
ok((await as(C, `select business_id from favorites`)).rows.length === 1, 'müşteri işletmeyi favorilere ekledi');
ok((await as(G, `select * from favorites`)).rows.length === 0 && (await as(null, `select * from favorites`)).rows.length === 0, 'başkası favorileri göremez');
await expectError(() => as(G, `insert into favorites (customer_id, business_id) values ($1, $2)`, [C, biz]), /row-level security/, 'başkası adına favori eklenemez');
await as(C, `delete from favorites where business_id = $1`, [biz]);
ok((await as(C, `select * from favorites`)).rows.length === 0, 'favoriden çıkarıldı');

// bekleme listesi: dolu güne yazılır, saat boşalınca haber kuyruğa girer, o güne randevu alınca listeden düşer
const nextWed = new Date(new Date(`${nextMon}T12:00:00Z`).getTime() + 2 * 864e5).toISOString().slice(0, 10);
await expectError(() => as(null, `select join_waitlist($1, $2)`, [biz, nextWed]), /giriş yapın/, 'giriş yapmayan bekleme listesine yazılamaz');
await expectError(() => as(C, `select join_waitlist($1, '2020-01-01')`, [biz]), /yazılamazsınız/, 'geçmiş güne bekleme listesi yok');
const freed = (await book(G, svc30, `${nextWed}T07:00:00Z`, 'Gizem', '0544 000 00 01')).rows[0].id;
await as(C, `select join_waitlist($1, $2)`, [biz, nextWed]);
await as(C, `select join_waitlist($1, $2)`, [biz, nextWed]);
ok((await as(C, `select day::text from waitlist`)).rows.map((r) => r.day).join() === nextWed, 'müşteri bekleme listesine bir kez yazıldı');
ok((await as(G, `select * from waitlist`)).rows.length === 0, 'başkasının bekleme kaydı görünmez');
await expectError(() => as(C, `insert into waitlist (business_id, customer_id, day) values ($1, $2, $3)`, [biz, C, nextWed]), /row-level security/, 'bekleme listesine doğrudan yazılamaz');
await expectError(() => as(C, `select * from claim_waitlist()`), /permission denied/, 'haber kuyruğu istemciden alınamaz');
await as(G, `select cancel_appointment($1)`, [freed]);
const wl = (await asService(`select day::text as day, email, customer_name, business_slug, tokens from claim_waitlist()`)).rows;
ok(wl.length === 1 && wl[0].email === 'c@x.com' && wl[0].day === nextWed && wl[0].business_slug === 'ahmet-berber' && Array.isArray(wl[0].tokens),
  `saat boşalınca bekleyene haber kuyruğa girdi: ${JSON.stringify(wl)}`);
ok((await asService(`select * from claim_waitlist()`)).rows.length === 0, 'haber bir kez alınır');
const freed2 = (await book(G, svc30, `${nextWed}T08:00:00Z`, 'Gizem', '0544 000 00 01')).rows[0].id;
await as(G, `select cancel_appointment($1)`, [freed2]);
ok((await asService(`select * from claim_waitlist()`)).rows.length === 0, '30 dakika içinde ikinci haber gitmez');
await db.query(`update waitlist set notified_at = now() - interval '1 hour'`);
const freed3 = (await book(G, svc30, `${nextWed}T08:30:00Z`, 'Gizem', '0544 000 00 01')).rows[0].id;
await as(A, `update appointments set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1`, [freed3]);
ok((await asService(`select * from claim_waitlist()`)).rows.length === 1, 'randevu başka güne alınınca da haber gider');
await book(C, svc30, `${nextWed}T09:00:00Z`);
ok((await as(C, `select * from waitlist`)).rows.length === 0, 'o güne randevu alan bekleme listesinden çıkar');
await db.query(`delete from appointments where id = any($1) or (customer_id = $2 and starts_at::date = $3)`, [[freed, freed2, freed3], C, nextWed]);

// seans paketi: tamamlanan randevu paketteki hizmetten bir seans düşer, geri alınınca iade edilir
const pkg = (await as(A, `insert into session_packages (business_id, phone_key, customer_name, service_id, name, total)
  values ($1, '5551112233', 'Cem', $2, 'Saç kesimi paketi', 3) returning id`, [biz, svc30])).rows[0].id;
const pkgUsed = async () => (await db.query(`select used from session_packages where id = $1`, [pkg])).rows[0].used;
const pkgOf = async (id) => (await db.query(`select package_id from appointments where id = $1`, [id])).rows[0].package_id;
const pkgAppt = (await book(C, svc30, `${nextWed}T10:00:00Z`)).rows[0].id;
const otherAppt = (await book(C, svc60, `${nextWed}T11:00:00Z`)).rows[0].id;
await as(A, `update appointments set status = 'completed' where id = any($1)`, [[pkgAppt, otherAppt]]);
ok((await pkgUsed()) === 1 && (await pkgOf(pkgAppt)) === pkg && (await pkgOf(otherAppt)) === null,
  'tamamlanan randevu kendi hizmetinin paketinden bir seans düştü, başka hizmet düşmedi');
await as(A, `update appointments set status = 'confirmed' where id = $1`, [pkgAppt]);
ok((await pkgUsed()) === 0 && (await pkgOf(pkgAppt)) === null, 'tamamlanma geri alınınca seans iade edildi');
await expectError(() => as(A, `update session_packages set used = 4 where id = $1`, [pkg]), /check constraint/, 'kullanılan seans toplamı aşamaz');
ok((await as(C, `select * from session_packages`)).rows.length === 0, 'müşteri işletmenin paket kaydını göremez');
await expectError(() => as(C, `insert into session_packages (business_id, phone_key, name, total) values ($1, '5551112233', 'x', 1)`, [biz]), /row-level security/, 'başkası paket ekleyemez');
await as(A, `update session_packages set used = total where id = $1`, [pkg]);
await as(A, `update appointments set status = 'completed' where id = $1`, [pkgAppt]);
ok((await pkgOf(pkgAppt)) === null && (await pkgUsed()) === 3, 'dolmuş paketten seans düşmez');
await db.query(`delete from appointments where id = any($1)`, [[pkgAppt, otherAppt]]);
await db.query(`delete from session_packages where id = $1`, [pkg]);

// Keşfet: bugün müsait (bugün boş saati olanlar) ve yakınımda (uzaklığa göre)
const nowTr = (await db.query(`select extract(isodow from now() at time zone 'Europe/Istanbul')::int d, extract(hour from now() at time zone 'Europe/Istanbul')::int h`)).rows[0];
const savedHours = (await db.query(`select * from working_hours where business_id = $1 and weekday = $2`, [biz, nowTr.d])).rows[0];
const savedNotice = (await db.query(`select min_notice_minutes m from businesses where id = $1`, [biz])).rows[0].m;
await db.query(`update working_hours set is_open = true, open_time = '00:00', close_time = '23:59' where business_id = $1 and weekday = $2`, [biz, nowTr.d]);
await db.query(`update businesses set min_notice_minutes = 0 where id = $1`, [biz]);
if (nowTr.h < 23) ok((await as(null, `select * from available_today($1)`, [[biz]])).rows.length === 1, 'bugün boş saati olan işletme "bugün müsait"');
await db.query(`update working_hours set is_open = false where business_id = $1 and weekday = $2`, [biz, nowTr.d]);
ok((await as(null, `select * from available_today($1)`, [[biz]])).rows.length === 0, 'bugün kapalı işletme "bugün müsait" değil');
await db.query(`update working_hours set is_open = $3, open_time = $4, close_time = $5 where business_id = $1 and weekday = $2`,
  [biz, nowTr.d, savedHours.is_open, savedHours.open_time, savedHours.close_time]);
await db.query(`update businesses set min_notice_minutes = $2 where id = $1`, [biz, savedNotice]);

await expectError(() => as(A, `update businesses set latitude = 41 where id = $1`, [biz]), /businesses_location_check/, 'enlem boylamsız girilemez');
await as(A, `update businesses set latitude = 40.99, longitude = 29.03 where id = $1`, [biz]);
const near = (await as(null, `select slug, round(distance_km::numeric, 1)::text km from nearby_businesses(41.0, 29.0)`)).rows;
ok(near.length === 1 && near[0].slug === 'ahmet-berber' && near[0].km === '2.8', `yakındaki işletme uzaklığıyla: ${JSON.stringify(near)}`);
ok((await as(null, `select * from nearby_businesses(39.93, 32.85)`)).rows.length === 0, '50 km dışındaki işletme gelmez');
ok((await as(null, `select * from nearby_businesses(41.0, 29.0, 'kuafor')`)).rows.length === 0, 'kategori süzgeci yakınımda da çalışır');

// rapor özeti: doluluk ve geri dönen müşteri
const sum = (await as(A, `select get_report_summary($1, $2, $3) s`, [biz, monday, tuesday])).rows[0].s;
ok(sum.capacity_minutes === 2 * 2 * 600 && sum.booked_minutes > 0 && sum.customers >= 1 && sum.returning === 0,
  `rapor özeti: ${JSON.stringify(sum)}`);
await expectError(() => as(C, `select get_report_summary($1, $2, $3)`, [biz, monday, tuesday]), /Yetkiniz yok/, 'başkası rapor özetini göremez');

// geçmiş randevu: işletme "tamamlandı" demese de değerlendirilir; "hizmet nasıldı?" bildirimi
const pastAppt = (status, hoursAgo) => db.query(`insert into appointments (business_id, service_id, customer_id, service_name, customer_name, customer_phone, customer_email, starts_at, ends_at, status)
  values ($1, $2, $3, 'Saç Kesimi', 'Cem Yılmaz', '05551112233', 'c@x.com', now() - $4::interval, now() - $4::interval + interval '30 min', $5) returning id`,
  [biz, svc30, C, `${hoursAgo} hours`, status]).then((r) => r.rows[0].id);
const past = await pastAppt('confirmed', 3);
const noShow = await pastAppt('no_show', 4);
const old = await pastAppt('confirmed', 100);
await expectError(() => as(A, `select queue_review_requests()`), /permission denied/, '"hizmet nasıldı?" kuyruğu istemciden çalıştırılamaz');
ok((await asService(`select queue_review_requests() c`)).rows[0].c === 2, 'bitişinden 2 saat geçen randevu için e-posta ve uygulama içi istek kuyruğa girdi');
ok((await asService(`select queue_review_requests() c`)).rows[0].c === 0, 'istek ikinci kez eklenmez');
ok((await notes(noShow)) === '' && (await notes(old)) === '', 'gelinmeyen ve 3 günden eski randevuya istek gitmez');
ok((await inbox(C)).some((r) => r.kind === 'review' && r.title === 'Hizmet nasıldı?' && r.body === 'Ahmet Berber · Saç Kesimi · Puan vermek için dokunun'),
  'müşteriye "Hizmet nasıldı?" bildirimi');
await as(C, `select register_push_token('ExponentPushToken[cem]', 'ios')`);
const rq = (await db.query(`select * from claim_notifications(100)`)).rows.filter((n) => n.kind === 'review');
const rp = (await asService(`select * from claim_push(100)`)).rows.filter((p) => p.kind === 'review');
ok(rq.length === 1 && rq[0].email === 'c@x.com' && rp.length === 1, 'geçmiş randevunun isteği atlanmadan e-posta ve push olarak gönderime alındı');
await expectError(() => as(C, `select add_review($1, 5, 'x')`, [noShow]), /tamamlanan/, 'gelinmeyen randevu değerlendirilemez');
await as(C, `select add_review($1, 5, 'Harika')`, [past]);
rb = (await db.query(`select rating_avg::text, rating_count from businesses where id = $1`, [biz])).rows[0];
ok(rb.rating_avg === '4.5' && rb.rating_count === 2, `"tamamlandı" denmemiş geçmiş randevu değerlendirildi: ${rb.rating_avg} (${rb.rating_count})`);
ib = (await inbox(A)).filter((r) => r.kind === 'reviewed');
ok(ib.length === 2 && ib.some((r) => r.title === 'Yeni değerlendirme: ★★★★☆' && r.body === 'Cem Y. · Saç Kesimi · Çok memnun kaldım')
  && ib.some((r) => r.title === 'Yeni değerlendirme: ★★★★★' && r.body === 'Cem Y. · Saç Kesimi · Harika'),
  `her değerlendirme işletmeye bildirildi: ${ib.map((r) => r.title).join(' | ')}`);
await as(A, `select register_push_token('ExponentPushToken[aaa]', 'android')`);
ok((await asService(`select * from claim_push(100)`)).rows.some((p) => p.kind === 'reviewed'), 'yeni değerlendirme push\'u (geçmiş randevuya rağmen) gönderime alındı');

const revId = (await db.query(`select id from reviews where appointment_id = $1`, [past])).rows[0].id;
await expectError(() => as(C, `select reply_review($1, 'x')`, [revId]), /cevap veremezsiniz/, 'müşteri cevap yazamaz');
ok((await as(A, `update reviews set reply = 'x' where id = $1 returning id`, [revId])).rows.length === 0, 'cevap doğrudan yazılamaz');
await as(A, `select reply_review($1, '  Teşekkür ederiz, yine bekleriz!  ')`, [revId]);
let rr = (await as(null, `select reply, replied_at from reviews where id = $1`, [revId])).rows[0];
ok(rr.reply === 'Teşekkür ederiz, yine bekleriz!' && rr.replied_at, 'işletmenin cevabı herkese açık');
await as(A, `select reply_review($1, '')`, [revId]);
rr = (await db.query(`select reply, replied_at from reviews where id = $1`, [revId])).rows[0];
ok(rr.reply === '' && rr.replied_at === null, 'boş cevap cevabı kaldırır');
await as(C, `select unregister_push_token('ExponentPushToken[cem]')`);
await as(A, `select unregister_push_token('ExponentPushToken[aaa]')`);
await db.query(`delete from appointments where id = any($1)`, [[past, noShow, old]]);
rb = (await db.query(`select rating_avg::text, rating_count from businesses where id = $1`, [biz])).rows[0];
ok(rb.rating_avg === '4.0' && rb.rating_count === 1, 'randevu silinince değerlendirmesi ve puanı da düştü');

await as(A, `insert into time_off (business_id, staff_id, starts_at, ends_at) values ($1, $2, $3, $4)`, [biz, st2, `${monday}T06:00:00Z`, `${monday}T16:00:00Z`]);
ok((await slots(svc30, monday)).length === 18, 'personel izinli olunca kapasite düştü');
await as(A, `insert into time_off (business_id, starts_at, ends_at) values ($1, $2, $3)`, [biz, `${monday}T00:00:00Z`, `${monday}T21:00:00Z`]);
ok((await slots(svc30, monday)).length === 0, 'işletme kapalı gün');

// paket düşürme: Başlangıç (1 personel) -> fazla personel pasif olur. Kalan Esnaf süresi fiyata göre çevrilir.
const leftBefore = ((await db.query(`select subscription_ends_at from businesses where id = $1`, [biz])).rows[0].subscription_ends_at - Date.now()) / 864e5;
const pay2 = (await as(A, `select * from create_payment('baslangic')`)).rows[0];
await db.query(`select activate_subscription($1, 349)`, [pay2.merchant_oid]);
const sub2 = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
const leftAfter = (sub2.subscription_ends_at - Date.now()) / 864e5;
ok(sub2.plan_id === 'baslangic' && Math.abs(leftAfter - (leftBefore * 649 / 349 + 30)) < 0.01,
  `paket değişince kalan süre yeni fiyata çevrildi, 30 gün eklendi: ${leftBefore.toFixed(2)} Esnaf günü -> ${leftAfter.toFixed(2)} gün`);
ok((await db.query(`select count(*)::int c from staff where business_id = $1 and is_active`, [biz])).rows[0].c === 1, 'küçük pakete geçince fazla personel pasif oldu');
await expectError(() => as(A, `select * from get_customers($1)`, [biz]), /paketinizde yok/, 'Başlangıç paketinde müşteri defteri yok');
ok((await as(A, `select * from customer_notes`)).rows.length === 0, 'Başlangıç paketinde müşteri notları görünmez');
await expectError(() => as(A, `insert into customer_notes (business_id, phone_key) values ($1, '5550000000')`, [biz]), /row-level security/, 'Başlangıç paketinde not yazılamaz');

// yayından kaldırılan işletme
await as(A, `update businesses set is_published = false where id = $1`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 0, 'yayında olmayan işletme gizli');
ok((await as(null, `select id from services`)).rows.length === 0, 'yayında olmayan işletmenin hizmetleri gizli');
ok((await as(A, `select id from businesses`)).rows.length === 1, 'sahibi kendi işletmesini görür');
await as(A, `update businesses set is_published = true where id = $1`, [biz]);

// yönetici
const ADM = '00000000-0000-0000-0000-0000000000ad';
const FAKE = '00000000-0000-0000-0000-0000000000af';
await db.exec(`
  insert into auth.users values ('${ADM}', 'DedYusuf99@gmail.com', '{"full_name":"Yönetici"}');
  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('${FAKE}', 'dedyusuf99@gmail.com', '{}', null);
`);
ok((await as(ADM, `select is_admin() a`)).rows[0].a === true, 'admin e-postası (büyük/küçük harf fark etmez) yönetici');
ok((await as(FAKE, `select is_admin() a`)).rows[0].a === false, 'e-postası doğrulanmamış hesap yönetici olamaz');
ok((await as(A, `select is_admin() a`)).rows[0].a === false && (await as(null, `select is_admin() a`)).rows[0].a === false, 'diğerleri yönetici değil');
ok((await as(A, `select * from admins`)).rows.length === 0, 'yönetici listesi istemciye kapalı');

for (const [sql, label] of [
  [`select admin_stats()`, 'istatistik'],
  [`select admin_dashboard(current_date - 29, current_date)`, 'ayrıntılı istatistik'],
  [`select * from admin_activity()`, 'etkinlik akışı'],
  [`select * from admin_users()`, 'kullanıcı listesi'],
  [`select admin_grant_subscription('${biz}', 'pro', 365)`, 'paket verme'],
  [`select admin_end_subscription('${biz}')`, 'abonelik bitirme'],
  [`select admin_set_suspended('${biz}', true)`, 'askıya alma'],
  [`select admin_review_business('${biz}', true)`, 'başvuru onayı'],
]) await expectError(() => as(A, sql), /Yetkiniz yok/, `işletme sahibi admin ${label} yapamaz`);
ok((await as(A, `update plans set price = 1 where id = 'pro' returning id`)).rows.length === 0, 'işletme sahibi paket fiyatı değiştiremez');

ok((await as(ADM, `select id from businesses`)).rows.length === 1 && (await as(ADM, `select id from appointments`)).rows.length > 0
  && (await as(ADM, `select id from payments`)).rows.length === 2 && (await as(ADM, `select id from profiles`)).rows.length === 6,
  'yönetici tüm işletme, randevu, ödeme ve profilleri görür');
const users = (await as(ADM, `select * from admin_users()`)).rows;
ok(users.length === 6 && users.find((u) => u.id === A).business_name === 'Ahmet Berber' && users.find((u) => u.id === ADM).is_admin, `kullanıcı listesi: ${users.length} kişi, işletme ve admin bilgisiyle`);

const before = (await db.query(`select subscription_ends_at from businesses where id = $1`, [biz])).rows[0].subscription_ends_at;
await expectError(() => as(ADM, `select admin_grant_subscription($1, 'pro', 0)`, [biz]), /1 ile 3650/, 'geçersiz süre reddedildi');
await expectError(() => as(ADM, `select admin_grant_subscription($1, 'yok', 30)`, [biz]), /Paket bulunamadı/, 'olmayan paket reddedildi');
await as(ADM, `select admin_grant_subscription($1, 'pro', 90, 1500)`, [biz]);
const g = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
ok(g.plan_id === 'pro' && Math.round((g.subscription_ends_at - before) / 864e5) === 90, 'yönetici Pro paketi verdi, 90 gün kalan süreye eklendi');
const admPay = (await db.query(`select merchant_oid, amount::text, status from payments where merchant_oid like 'ADM%'`)).rows;
ok(admPay.length === 1 && admPay[0].amount === '1500.00' && admPay[0].status === 'paid', 'yönetici işlemi ödeme geçmişine yazıldı');

// Denemedeki ikinci işletme: gelire ve aktif aboneliklere sayılmaz.
const B = '00000000-0000-0000-0000-00000000000b';
await db.exec(`insert into auth.users values ('${B}', 'b@x.com', '{"full_name":"Berna"}')`);
const bizB = (await as(B, `insert into businesses (owner_id, slug, name) values ($1, 'berna-kuafor', 'Berna Kuaför') returning id`, [B])).rows[0].id;
// Başvuru önce sebebiyle reddedilir; sahibi düzeltip yeniden başvurur, onaylanınca 7 gün Pro denemeye girer.
await expectError(() => as(ADM, `select admin_review_business($1, false, ' ')`, [bizB]), /Ret sebebini/, 'sebepsiz ret reddedildi');
await expectError(() => as(ADM, `select admin_grant_subscription($1, 'pro', 30)`, [bizB]), /Önce başvuruyu onaylayın/, 'onaysız işletmeye paket verilemez');
await as(ADM, `select admin_review_business($1, false, '  Adres eksik. ')`, [bizB]);
const rej = (await as(B, `select approval_status, approval_note, reviewed_by from businesses where id = $1`, [bizB])).rows[0];
ok(rej.approval_status === 'rejected' && rej.approval_note === 'Adres eksik.' && rej.reviewed_by === ADM, 'başvuru sebebiyle reddedildi, sahibi sebebi görür');
await as(B, `update businesses set address = 'Atatürk Cd. 5', approval_status = 'pending', approval_note = '' where id = $1`, [bizB]);
const re = (await db.query(`select approval_status, approval_note, address from businesses where id = $1`, [bizB])).rows[0];
ok(re.approval_status === 'pending' && re.approval_note === 'Adres eksik.' && re.address === 'Atatürk Cd. 5',
  'reddedilen işletme düzeltip yeniden başvurdu (ret sebebini silemez)');
await as(B, `update businesses set approval_status = 'approved' where id = $1`, [bizB]);
ok((await db.query(`select approval_status s from businesses where id = $1`, [bizB])).rows[0].s === 'pending', 'yeniden başvuran kendini onaylayamaz');
await as(ADM, `select admin_review_business($1, true)`, [bizB]);
const appr = (await db.query(`select approval_status, approval_note, plan_id, subscription_ends_at, trial_ends_at from businesses where id = $1`, [bizB])).rows[0];
const trialDays = (appr.subscription_ends_at - Date.now()) / 864e5;
ok(appr.approval_status === 'approved' && appr.approval_note === '' && appr.plan_id === 'pro' && trialDays > 6.9 && trialDays < 7.1
  && appr.trial_ends_at.getTime() === appr.subscription_ends_at.getTime(), `onaylanan işletmeye 7 gün Pro deneme: ${trialDays.toFixed(2)} gün`);
ok((await as(null, `select id from businesses where id = $1`, [bizB])).rows.length === 1, 'onaylanan, denemedeki işletme yayında');
await expectError(() => as(ADM, `select admin_review_business($1, false, 'Geç kalan ret')`, [bizB]), /zaten onaylı/, 'onaylı işletme reddedilemez');
const stats = (await as(ADM, `select admin_stats() s`)).rows[0].s;
ok(stats.users === 7 && stats.businesses === 2 && stats.active === 1 && stats.trial === 1 && stats.never_paid === 1
  && Number(stats.mrr) === 999 && Number(stats.revenue_total) === 649 + 349 + 1500
  && stats.daily.length === 30 && stats.by_plan.find((p) => p.id === 'pro').count === 1,
  `istatistikler (deneme ayrı): ${JSON.stringify({ u: stats.users, b: stats.businesses, active: stats.active, trial: stats.trial, never: stats.never_paid, mrr: stats.mrr, rev: stats.revenue_total })}`);
const today = new Date().toISOString().slice(0, 10);
const dash = (await as(ADM, `select admin_dashboard(current_date - 29, current_date) d`)).rows[0].d;
ok(dash.days === 30 && dash.daily.length === 30 && dash.kpi.businesses.cur === 2 && dash.kpi.users.cur === 7
  && dash.snapshot.active === 1 && Number(dash.kpi.revenue.cur) === 649 + 349 + 1500 && dash.cohorts.length === 6
  && dash.funnel_business.business === 2 && Object.keys(dash.ratings.dist).length === 5 && Array.isArray(dash.heatmap)
  && typeof dash.lead_time.more === 'number' && dash.daily.at(-1).day === today,
  `ayrıntılı istatistik: ${JSON.stringify({ days: dash.days, biz: dash.kpi.businesses, users: dash.kpi.users, rev: dash.kpi.revenue, funnel: dash.funnel_business })}`);
await expectError(() => as(ADM, `select admin_dashboard(current_date, current_date - 1)`), /Geçersiz tarih/, 'ters tarih aralığı reddedildi');
await expectError(() => as(ADM, `select admin_dashboard(current_date - 400, current_date)`), /Geçersiz tarih/, '366 günden uzun aralık reddedildi');
const feed = (await as(ADM, `select * from admin_activity(10)`)).rows;
ok(feed.length === 10 && feed.every((r, i) => i === 0 || r.occurred_at <= feed[i - 1].occurred_at) && feed.some((r) => r.kind === 'business'),
  `etkinlik akışı yeniden eskiye: ${feed.map((r) => r.kind).join(',')}`);
const one = (await as(ADM, `select * from admin_users($1)`, [A])).rows;
ok(one.length === 1 && one[0].business_name === 'Ahmet Berber', 'tek kullanıcı bilgisi');
await db.query(`delete from businesses where id = $1`, [bizB]);

await as(ADM, `select admin_set_suspended($1, true)`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 0 && (await slots(svc30, tuesday)).length === 0, 'askıdaki işletme gizli ve randevu almaz');
await as(A, `update businesses set is_suspended = false where id = $1`, [biz]);
ok((await db.query(`select is_suspended from businesses where id = $1`, [biz])).rows[0].is_suspended === true, 'işletme sahibi askıyı kaldıramaz');
await as(ADM, `select admin_set_suspended($1, false)`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 1, 'askıdan çıkınca tekrar görünür');

// Yönetici işletmeyi düzenler (ad, görseller); sahip, abonelik, askı, onay ve puan alanları korunur.
const bizCols = `select name, logo_url, owner_id, subscription_ends_at, is_suspended, approval_status, rating_count from businesses where id = $1`;
const prev = (await db.query(bizCols, [biz])).rows[0];
await as(ADM, `update businesses set name = 'Ahmet Berber Salonu', logo_url = '${UP}/logo/adm.jpg', owner_id = $2,
  subscription_ends_at = now() + interval '10 years', is_suspended = true, approval_status = 'rejected', rating_count = 99 where id = $1`, [biz, C]);
const edited = (await db.query(bizCols, [biz])).rows[0];
ok(edited.name === 'Ahmet Berber Salonu' && edited.logo_url === `${UP}/logo/adm.jpg` && edited.owner_id === A
  && edited.subscription_ends_at.getTime() === prev.subscription_ends_at.getTime() && !edited.is_suspended
  && edited.approval_status === 'approved' && edited.rating_count === prev.rating_count,
  'yönetici adı ve logoyu değiştirdi; sahip, abonelik, askı, onay ve puan değişmedi');
await as(A, `update businesses set owner_id = $2 where id = $1`, [biz, C]);
ok((await db.query(bizCols, [biz])).rows[0].owner_id === A, 'işletme sahibi işletmeyi başkasına devredemez');
ok((await as(C, `update businesses set name = 'Ele geçirildi' where id = $1 returning id`, [biz])).rows.length === 0,
  'yönetici olmayan başkasının işletmesini düzenleyemez');
await as(ADM, `update businesses set name = $2, logo_url = $3 where id = $1`, [biz, prev.name, prev.logo_url]);

await as(ADM, `select admin_end_subscription($1)`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 0, 'yönetici aboneliği bitirince işletme yayından düştü');

await as(ADM, `update plans set price = 999, staff_limit = 10 where id = 'pro'`);
await as(ADM, `insert into plans (id, name, price, staff_limit, sort_order) values ('kurumsal', 'Kurumsal', 1999, null, 4)`);
ok((await as(null, `select price::int p from plans where id = 'pro'`)).rows[0].p === 999 && (await as(null, `select id from plans`)).rows.length === 4, 'yönetici paket fiyatını değiştirdi ve yeni paket ekledi');
await expectError(() => as(ADM, `update plans set price = 0 where id = 'pro'`), /check constraint/, 'sıfır fiyat reddedildi');

// davet: yeni işletme (Rıza) Ahmet Berber'in koduyla gelir; kod ve davet eden istemciden yazılamaz
const R = '00000000-0000-0000-0000-0000000000d1';
await db.exec(`insert into auth.users values ('${R}', 'r@x.com', '{"full_name":"Rıza","role":"business"}')`);
const bizR = (await as(R, `insert into businesses (owner_id, slug, name, referral_code, referred_by)
  values ($1, 'riza-kuafor', 'Rıza Kuaför', 'HILE1234', $2) returning id, referral_code, referred_by`, [R, biz])).rows[0];
ok(/^[0-9A-F]{8}$/.test(bizR.referral_code) && bizR.referral_code !== 'HILE1234' && bizR.referred_by === null,
  `davet kodu otomatik, istemci yazamaz: ${bizR.referral_code}`);
await as(ADM, `select admin_review_business($1, true)`, [bizR.id]);
const codeA = (await db.query(`select referral_code from businesses where id = $1`, [biz])).rows[0].referral_code;
await expectError(() => as(R, `select apply_referral('YANLIS99')`), /geçersiz/, 'olmayan davet kodu reddedildi');
await expectError(() => as(R, `select apply_referral($1)`, [bizR.referral_code]), /geçersiz/, 'kendi koduyla davet olmaz');
await expectError(() => as(A, `select apply_referral($1)`, [bizR.referral_code]), /ilk ödemeden/, 'ödeme yapmış işletme davet kodu giremez');
ok((await as(R, `select apply_referral($1) n`, [` ${codeA.toLowerCase()} `])).rows[0].n === 'Ahmet Berber', 'davet kodu girildi (boşluk ve küçük harf sorun değil)');
await expectError(() => as(R, `select apply_referral($1)`, [codeA]), /zaten/, 'davet kodu ikinci kez girilemez');
await as(R, `update businesses set referred_by = null, referral_code = 'DEGISTI1' where id = $1`, [bizR.id]);
const rRow = (await db.query(`select referred_by, referral_code from businesses where id = $1`, [bizR.id])).rows[0];
ok(rRow.referred_by === biz && rRow.referral_code === bizR.referral_code, 'davet eden ve kod sonradan değiştirilemez');

// yıllık ödeme: 10 ay fiyatına 365 gün; davetle gelenin ilk ödemesinde ikisine de 30 gün
await expectError(() => as(R, `select * from create_payment('esnaf', 6)`), /Geçersiz ödeme dönemi/, '6 aylık ödeme yok');
const endsAt = async (id) => (await db.query(`select subscription_ends_at e from businesses where id = $1`, [id])).rows[0].e;
const aBefore = await endsAt(biz);
const rBefore = await endsAt(bizR.id);
const yearly = (await as(R, `select * from create_payment('esnaf', 12)`)).rows[0];
ok(Number(yearly.amount) === 6490 && (await db.query(`select months from payments where merchant_oid = $1`, [yearly.merchant_oid])).rows[0].months === 12,
  `yıllık Esnaf 10 ay fiyatına: ${yearly.amount}`);
await expectError(() => db.query(`select activate_subscription($1, 649)`, [yearly.merchant_oid]), /eksik/, 'yıllık ödemede aylık tutar kabul edilmez');
await db.query(`select activate_subscription($1, $2)`, [yearly.merchant_oid, yearly.amount]);
const rDays = Math.round(((await endsAt(bizR.id)) - rBefore) / 864e5);
ok(rDays === 365 + 30, `yıllık ödeme 365 gün, davet ödülü 30 gün: ${rDays}`);
const aEnds = await endsAt(biz);
const aDays = Math.round((aEnds - Math.max(aBefore, Date.now())) / 864e5);
ok(aDays === 30, `davet eden işletmeye 30 gün eklendi: ${aDays}`);
const second = (await as(R, `select * from create_payment('esnaf')`)).rows[0];
await db.query(`select activate_subscription($1, $2)`, [second.merchant_oid, second.amount]);
ok(Number(second.amount) === 649 && (await endsAt(biz)).getTime() === aEnds.getTime(), 'aylık ödeme tek ay fiyatı; davet ödülü yalnızca ilk ödemede');
const refs = (await as(A, `select * from my_referrals()`)).rows;
ok(refs.length === 1 && refs[0].name === 'Rıza Kuaför' && refs[0].rewarded_at, 'davet eden, davet ettiklerini ve ödülü görür');
ok((await as(C, `select * from my_referrals()`)).rows.length === 0, 'başkası davet listesini göremez');

// hata kaydı: girişsiz de yazılır, aynı hata tek satırda sayılır, yalnızca yönetici okur
const stack = 'TypeError: x is undefined\n    at render (app.js:10:5)\n    at main (app.js:1:1)';
await as(null, `select log_error('web', 'TypeError: x is undefined', $1, '/panel')`, [stack]);
await as(C, `select log_error('web', 'TypeError: x is undefined', $1, '/kesfet')`, [stack]);
await as(null, `select log_error('mobile', 'TypeError: x is undefined', $1)`, [stack]);
await as(null, `select log_error('web', '   ')`);
await as(null, `select log_error('hacker', 'x')`);
const errs = (await as(ADM, `select source, count, url, last_user_id from error_logs order by source desc`)).rows;
ok(errs.length === 2 && errs[0].source === 'web' && errs[0].count === 2 && errs[0].url === '/kesfet' && errs[0].last_user_id === C,
  `aynı hata tek satırda sayıldı, boş/geçersiz kayıt yok: ${JSON.stringify(errs)}`);
ok((await as(C, `select * from error_logs`)).rows.length === 0 && (await as(null, `select * from error_logs`)).rows.length === 0, 'hata kayıtlarını yalnızca yönetici görür');
await expectError(() => as(C, `insert into error_logs (fingerprint, source, message) values ('x', 'web', 'x')`), /row-level security/, 'hata kaydı doğrudan yazılamaz');
await as(ADM, `update error_logs set resolved_at = now() where source = 'web'`);
await as(null, `select log_error('web', 'TypeError: x is undefined', $1)`, [stack]);
ok((await as(ADM, `select resolved_at from error_logs where source = 'web'`)).rows[0].resolved_at === null, 'çözülen hata tekrar edince yeniden açıldı');
await as(null, `select log_error('server', $1)`, ['x'.repeat(5000)]);
ok((await as(ADM, `select length(message) n from error_logs where source = 'server'`)).rows[0].n === 1000, 'uzun mesaj kısaltıldı');

// güvenlik: başka işletmenin personeli/hizmeti, işletmeler arası müşteri lekeleme, saat dilimi, uzunluk ve adres
// sınırları, ödeme denemesi sınırı. Rakip işletme sonunda silinir.
const X = '00000000-0000-0000-0000-0000000000e1';
await db.exec(`insert into auth.users values ('${X}', 'x@x.com', '{"full_name":"Rakip"}')`);
const bizX = (await as(X, `insert into businesses (owner_id, slug, name) values ($1, 'rakip-berber', 'Rakip Berber') returning id`, [X])).rows[0].id;
await as(ADM, `select admin_review_business($1, true)`, [bizX]);
const staffX = (await db.query(`select id from staff where business_id = $1`, [bizX])).rows[0].id;
const xAppt = (sid, svc) => as(X, `insert into appointments (business_id, staff_id, service_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
  values ($1, $2, $3, 'x', 'x', '05550000000', now() + interval '2 days', now() + interval '2 days 30 minutes', 'confirmed')`, [bizX, sid, svc]);
await expectError(() => xAppt(staff[0].id, null), /Personel bulunamadı/, 'başka işletmenin personeline randevu yazılamaz (saatleri doldurulamaz)');
await expectError(() => xAppt(staffX, svc30), /Hizmet bulunamadı/, 'başka işletmenin hizmetiyle randevu yazılamaz');
const ownAppt = (await as(A, `insert into appointments (business_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
  values ($1, 'x', 'x', '05550000000', now() + interval '3 days', now() + interval '3 days 30 minutes', 'confirmed') returning id`, [biz])).rows[0].id;
await expectError(() => as(A, `update appointments set staff_id = $2 where id = $1`, [ownAppt, staffX]), /Personel bulunamadı/, 'randevu sonradan başka işletmenin personeline taşınamaz');
await db.query(`delete from appointments where id = $1`, [ownAppt]);
await db.query(`update businesses set subscription_ends_at = now() + interval '30 days', plan_id = 'pro' where id = $1`, [biz]);
const poisonDay = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 14 * 864e5).toISOString().slice(0, 10);
const free = (await slots(svc30, poisonDay)).map((r) => r.slot_start.toISOString());
ok(free.length >= 6, `sınama günü boş saatler: ${free.length}`);
const accountAppt = (await book(C, svc30, free[5])).rows[0].id;
await as(A, `update appointments set customer_phone = '0533 444 55 66' where id = $1`, [accountAppt]);
ok((await db.query(`select customer_phone from appointments where id = $1`, [accountAppt])).rows[0].customer_phone === '0555 111 22 33',
  'hesapla alınan randevunun telefonu işletme tarafından değiştirilemez');
// Gelmeme tüm işletmelerde sayılır: yaklaşan randevu hemen "gelmedi" yapılıp müşteri lekelenemez.
await expectError(() => as(A, `update appointments set status = 'no_show' where id = $1`, [accountAppt]), /Gelmedi/,
  'hesapla alınan yaklaşan randevu "gelmedi" işaretlenemez');
await expectError(() => as(A, `update appointments set starts_at = now() - interval '1 hour', ends_at = now() - interval '30 minutes' where id = $1`, [accountAppt]),
  /geçmiş bir saate/, 'hesapla alınan yaklaşan randevu geçmişe alınamaz');
await db.query(`update appointments set starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes' where id = $1`, [accountAppt]);
await as(A, `update appointments set status = 'no_show' where id = $1`, [accountAppt]);
ok((await db.query(`select status from appointments where id = $1`, [accountAppt])).rows[0].status === 'no_show', 'saati geçen randevu "gelmedi" işaretlenir');
await db.query(`delete from blocked_customers where business_id = $1 and customer_id = $2`, [biz, C]);
await db.query(`delete from appointments where id = $1`, [accountAppt]);

const victimPhone = '0533 444 55 66';
for (const h of [48, 72]) {
  const id = (await as(X, `insert into appointments (business_id, staff_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
    values ($1, $2, 'x', 'Kurban', $3, now() + make_interval(hours => $4), now() + make_interval(hours => $4 + 1), 'confirmed') returning id`, [bizX, staffX, victimPhone, h])).rows[0].id;
  await as(X, `update appointments set status = 'no_show' where id = $1`, [id]);
}
const noShows = async (b) => (await db.query(`select no_shows from customer_history(null, $1, $2)`, [victimPhone, b])).rows[0].no_shows;
ok(await noShows(bizX) === 2 && await noShows(biz) === 0, 'elle eklenen gelmeme yalnızca o işletmede sayılır (müşteri başka işletmelerde lekelenemez)');

// Saldırgan hesap (X) kurbanın telefonuyla randevu alıp iptal eder: kurbanın kendi hesabı lekelenmez.
const V = '00000000-0000-0000-0000-0000000000e2';
await db.exec(`insert into auth.users values ('${V}', 'v@x.com', '{"full_name":"Kurban"}')`);
for (const t of free.slice(0, 3)) {
  const id = (await book(X, svc30, t, 'Kurban', victimPhone)).rows[0].id;
  await as(X, `select cancel_appointment($1)`, [id]);
}
const victimBooking = (await book(V, svc30, free[3], 'Kurban', victimPhone)).rows[0];
const vRow = (await db.query(`select prior_cancels, customer_flagged from appointments where id = $1`, [victimBooking.id])).rows[0];
ok(victimBooking.status === 'confirmed' && vRow.prior_cancels === 0 && !vRow.customer_flagged,
  `başkasının telefonuyla yapılan iptaller kurbana yazılmaz: ${JSON.stringify(vRow)}`);
await db.query(`delete from appointments where id = $1`, [victimBooking.id]);

// randevu onay modları: "yalnızca tanıdık müşteriyi otomatik onayla" -> daha önce tamamlanmış randevusu olan (K)
// onaylı, ilk kez gelen (N) onay bekler. Ret sebebi müşteriye bildirimle gider; müşteri kartı yalnızca işletmeye açık.
const K = '00000000-0000-0000-0000-0000000000e3';
const N = '00000000-0000-0000-0000-0000000000e4';
await db.exec(`insert into auth.users values ('${K}', 'k@x.com', '{"full_name":"Kaan"}'), ('${N}', 'n@x.com', '{"full_name":"Nur"}')`);
const kPast = (await db.query(`insert into appointments (business_id, staff_id, service_id, customer_id, service_name, customer_name, customer_phone, price, starts_at, ends_at, status)
  values ($1, $2, $3, $4, 'Saç Kesimi', 'Kaan', '0544 222 33 44', 300, now() - interval '10 days', now() - interval '10 days' + interval '30 minutes', 'completed') returning id`,
  [biz, staff[0].id, svc30, K])).rows[0].id;
await db.query(`insert into reviews (business_id, appointment_id, customer_id, customer_name, rating, comment) values ($1, $2, $3, 'Kaan', 2, 'Geç kaldılar')`, [biz, kPast, K]);
const modeDay = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 21 * 864e5).toISOString().slice(0, 10);
const modeFree = (await slots(svc30, modeDay)).map((r) => r.slot_start.toISOString());
await as(A, `update businesses set auto_confirm = true, auto_confirm_known_only = true where id = $1`, [biz]);
const kBook = (await book(K, svc30, modeFree[0], 'Kaan', '0544 222 33 44')).rows[0];
const nBook = (await book(N, svc30, modeFree[1], 'Nur', '0544 555 66 77')).rows[0];
ok(kBook.status === 'confirmed' && nBook.status === 'pending', `tanıdık müşteri otomatik, ilk kez gelen onaya düştü: ${kBook.status}, ${nBook.status}`);
await expectError(() => as(A, `select needs_confirmation(b, $1) from businesses b where b.id = $2`, [K, biz]), /permission denied/, 'onay kuralı istemciden sorgulanamaz (ziyaretler açığa çıkmaz)');

const card = (await as(A, `select customer_card($1) c`, [kBook.id])).rows[0].c;
ok(card.member_since && card.here.completed === 1 && card.platform.completed === 1 && card.platform.businesses === 1
  && card.reviews.count === 1 && Number(card.reviews.avg) === 2 && card.reviews.latest[0].comment === 'Geç kaldılar' && card.reviews.latest[0].business === 'Ahmet Berber',
  `müşteri kartı: geçmiş ve yazdığı yorumlar ${JSON.stringify({ here: card.here, platform: card.platform, reviews: card.reviews.count })}`);
const nCard = (await as(A, `select customer_card($1) c`, [nBook.id])).rows[0].c;
ok(nCard.here.completed === 0 && nCard.platform.completed === 0 && nCard.reviews.count === 0 && nCard.reviews.latest.length === 0, 'yeni müşterinin kartı boş');
await expectError(() => as(X, `select customer_card($1)`, [kBook.id]), /bulunamadı/, 'başka işletme müşteri kartını göremez');
await expectError(() => as(K, `select customer_card($1)`, [kBook.id]), /bulunamadı/, 'müşteri kendi kartını sorgulayamaz');
const manualCard = (await as(A, `select customer_card(id) c from appointments where id = $1`, [kPast])).rows[0].c;
ok(manualCard.platform === null || manualCard.platform.completed === 0, 'kart geçerli randevunun kendisini saymaz');

await as(A, `update appointments set status = 'cancelled', cancel_reason = '  Bu saat dolu  ' where id = $1`, [nBook.id]);
const nRow = (await db.query(`select status, cancelled_by, rejected, cancel_reason from appointments where id = $1`, [nBook.id])).rows[0];
ok(nRow.rejected && nRow.cancelled_by === 'business' && nRow.cancel_reason === 'Bu saat dolu', `bekleyen randevu sebebiyle reddedildi: ${JSON.stringify(nRow)}`);
const nInbox = (await db.query(`select title, body from inbox where appointment_id = $1 and recipient = 'customer'`, [nBook.id])).rows[0];
ok(nInbox?.title === 'Randevu talebiniz onaylanmadı' && nInbox.body.includes('Bu saat dolu'), `müşteriye "onaylanmadı" bildirimi sebebiyle: ${nInbox?.title} / ${nInbox?.body}`);
ok((await db.query(`select 1 from notifications where appointment_id = $1 and kind = 'cancelled' and recipient = 'customer'`, [nBook.id])).rows.length === 1, 'ret e-postası kuyruğa girdi');

await as(A, `update appointments set status = 'cancelled', cancel_reason = 'Dükkan kapalı' where id = $1`, [kBook.id]);
const kRow = (await db.query(`select rejected, cancel_reason from appointments where id = $1`, [kBook.id])).rows[0];
ok(!kRow.rejected && kRow.cancel_reason === 'Dükkan kapalı', 'onaylı randevunun iptali "reddedildi" sayılmaz, sebep kalır');
const kInbox = (await db.query(`select title from inbox where appointment_id = $1 and recipient = 'customer' and kind = 'cancelled'`, [kBook.id])).rows[0];
ok(kInbox?.title === 'Randevunuz iptal edildi', 'iptal bildirimi "iptal edildi" der');
await as(A, `update appointments set status = 'confirmed' where id = $1`, [kBook.id]);
ok((await db.query(`select cancel_reason r from appointments where id = $1`, [kBook.id])).rows[0].r === '', 'iptal geri alınınca sebep silindi');

// Tanıdık olmayan müşteri saatini değiştirirse yeniden onaya düşer; elle onay modunda tanıdık da onaya düşer.
const nBook2 = (await book(N, svc30, modeFree[2], 'Nur', '0544 555 66 77')).rows[0].id;
await as(A, `update appointments set status = 'confirmed' where id = $1`, [nBook2]);
await as(N, `select reschedule_appointment($1, $2)`, [nBook2, modeFree[3]]);
ok((await db.query(`select status from appointments where id = $1`, [nBook2])).rows[0].status === 'pending', 'yeni müşterinin saat değişikliği onaya düştü');
await as(A, `update businesses set auto_confirm = false where id = $1`, [biz]);
const kManual = (await book(K, svc30, modeFree[4], 'Kaan', '0544 222 33 44')).rows[0];
await as(A, `update businesses set auto_confirm = true, auto_confirm_known_only = false where id = $1`, [biz]);
const nAuto = (await book(N, svc30, modeFree[5], 'Nur', '0544 555 66 77')).rows[0];
ok(kManual.status === 'pending' && nAuto.status === 'confirmed', `elle onayda tanıdık bekler, otomatikte yeni müşteri onaylı: ${kManual.status}, ${nAuto.status}`);
await db.query(`delete from appointments where customer_id = any($1)`, [[K, N]]);
await db.query(`delete from auth.users where id = any($1)`, [[K, N]]);

// hesap silme: müşteri yaklaşan randevusunu iptal eder ve yorumdaki adını kaldırır; işletme sahibi silemez
const delAppt = (await book(V, svc30, free[4], 'Kurban', victimPhone)).rows[0].id;
await expectError(() => as(null, `select delete_my_account()`), /Giriş yapmalısınız/, 'girişsiz hesap silinemez');
await expectError(() => as(A, `select delete_my_account()`), /İşletme hesabı/, 'işletme sahibi hesabını buradan silemez');
ok((await db.query(`select count(*)::int c from notifications where appointment_id = $1 and recipient = 'customer'`, [delAppt])).rows[0].c > 0,
  'silinecek müşteriye e-posta kuyruğa girmişti');
await as(V, `select delete_my_account()`);
const deleted = (await db.query(`select status, customer_email from appointments where id = $1`, [delAppt])).rows[0];
ok(deleted.status === 'cancelled', 'hesap silinirken yaklaşan randevu iptal edildi');
ok(deleted.customer_email === null
  && (await db.query(`select count(*)::int c from notifications where appointment_id = $1 and recipient = 'customer'`, [delAppt])).rows[0].c === 0
  && (await db.query(`select count(*)::int c from notifications where appointment_id = $1 and recipient = 'business' and kind = 'cancelled'`, [delAppt])).rows[0].c === 1,
  'silinen hesabın e-postası randevudan ve gönderim kayıtlarından kalktı, işletmeye iptal haberi gitti');
await db.query(`delete from appointments where id = $1`, [delAppt]);
await db.query(`delete from auth.users where id = $1`, [V]);

await expectError(() => as(A, `update businesses set timezone = 'Mars/Olympus' where id = $1`, [biz]), /time zone/, 'geçersiz saat dilimi reddedildi');
for (const [sql, label] of [
  [`name = repeat('a', 101)`, '100 karakterden uzun işletme adı'],
  [`description = repeat('a', 2001)`, '2000 karakterden uzun açıklama'],
  [`logo_url = 'javascript:alert(1)'`, 'https olmayan logo adresi'],
  [`cover_url = 'http://ornek.com/kapak.jpg'`, 'http kapak adresi'],
  [`gallery = array_fill('${UP}/gallery/a.jpg'::text, array[13])`, '12 görselden büyük galeri'],
  [`gallery = array['${UP}/gallery/a.jpg', 'data:image/svg+xml,<svg onload=alert(1)>']`, 'https olmayan galeri görseli'],
  // Sitenin yüklemediği adresler (izleme pikseli): mobil uygulamada ziyaretçinin IP'sini sızdırırdı.
  [`logo_url = 'https://izleyici.ornek.com/p.gif'`, 'başka sunucudaki logo'],
  [`cover_url = 'https://baska-kova.r2.dev/businesses/00000000-0000-0000-0000-000000000000/cover/a.jpg'`, 'başka R2 kovasındaki kapak'],
  [`gallery = array['${UP}/gallery/a.jpg', 'https://izleyici.ornek.com/p.gif']`, 'başka sunucudaki galeri görseli'],
  [`gallery = array['${UP}/gallery/a.jpg', null]`, 'boş galeri öğesi'],
  [`logo_url = '${UP}/logo/../../../x.jpg'`, 'yükleme klasörü dışına çıkan logo'],
]) await expectError(() => as(A, `update businesses set ${sql} where id = $1`, [biz]), /check constraint/, `${label} reddedildi`);
await expectError(() => as(A, `update staff set avatar_url = 'https://izleyici.ornek.com/p.gif' where business_id = $1`, [biz]), /check constraint/,
  'başka sunucudaki personel fotoğrafı reddedildi');
await as(A, `update businesses set logo_url = '${UP}/logo/1.jpg', gallery = array['${UP}/gallery/1.jpg', '${UP}/gallery/2.webp'] where id = $1`, [biz]);
ok((await db.query(`select cardinality(gallery) n from businesses where id = $1`, [biz])).rows[0].n === 2, 'sitenin yüklediği görseller kabul edildi');
await expectError(() => as(C, `update profiles set full_name = repeat('a', 101) where id = $1`, [C]), /check constraint/, 'çok uzun profil adı reddedildi');

// Kayıt tarihleri elle yazılamaz: müşteri kartındaki üyelik tarihi geriye alınıp eski üye gibi görünülemez.
const since = (await db.query(`select created_at from profiles where id = $1`, [C])).rows[0].created_at;
await as(C, `update profiles set created_at = '2015-01-01', full_name = 'Cem' where id = $1`, [C]);
ok((await db.query(`select created_at from profiles where id = $1`, [C])).rows[0].created_at.getTime() === since.getTime(), 'müşteri üyelik tarihini değiştiremez');
const bizSince = (await db.query(`select created_at from businesses where id = $1`, [biz])).rows[0].created_at;
await as(A, `update businesses set created_at = '2015-01-01' where id = $1`, [biz]);
ok((await db.query(`select created_at from businesses where id = $1`, [biz])).rows[0].created_at.getTime() === bizSince.getTime(), 'işletme kayıt tarihini değiştiremez');
await expectError(() => as(C, `select register_push_token($1, 'android')`, [`ExponentPushToken[${'a'.repeat(300)}]`]), /check constraint/,
  'çok uzun push adresi reddedildi');
await expectError(() => book(C, svc30, `${monday}T08:00:00Z`, 'a'.repeat(101)), /en fazla 100/, 'çok uzun müşteri adıyla randevu reddedildi');
await expectError(() => book(C, svc30, `${monday}T08:00:00Z`, 'Cem', '0'.repeat(31)), /telefon/, 'çok uzun telefonla randevu reddedildi');

for (let i = 0; i < 10; i++) await as(X, `select * from create_payment('baslangic')`);
await expectError(() => as(X, `select * from create_payment('baslangic')`), /Çok fazla ödeme/, 'saatte 10\'dan fazla ödeme denemesi reddedildi');
await db.query(`delete from businesses where id = $1`, [bizX]);
await db.query(`delete from auth.users where id = $1`, [X]);

console.log(failures ? `\n${failures} TEST BAŞARISIZ` : '\nTÜM TESTLER GEÇTİ');
process.exit(failures ? 1 : 0);
