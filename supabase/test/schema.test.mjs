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

// ücretsiz deneme: yeni işletme 7 gün Pro
const trial = (await db.query(`select plan_id, subscription_ends_at, trial_ends_at from businesses where id = $1`, [biz])).rows[0];
const trialDays = (trial.subscription_ends_at - Date.now()) / 864e5;
ok(trial.plan_id === 'pro' && trialDays > 6.9 && trialDays < 7.1 && trial.trial_ends_at.getTime() === trial.subscription_ends_at.getTime(),
  `yeni işletmeye 7 gün Pro deneme: ${trialDays.toFixed(2)} gün`);
ok((await as(null, `select id from businesses`)).rows.length === 1, 'denemedeki işletme yayında');
await as(A, `update businesses set trial_ends_at = now() + interval '1 year' where id = $1`, [biz]);
ok((await db.query(`select trial_ends_at from businesses where id = $1`, [biz])).rows[0].trial_ends_at.getTime() === trial.trial_ends_at.getTime(), 'işletme sahibi denemeyi uzatamaz');
// Ödeme kurallarını sınamak için işletme hiç deneme almamış gibi sıfırlanır.
await db.query(`update businesses set plan_id = null, subscription_ends_at = null, trial_ends_at = null where id = $1`, [biz]);

await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'panel', 'X')`, [C]), /check constraint/, 'ayrılmış adres (panel) reddedildi');
await expectError(() => as(C, `insert into businesses (owner_id, slug, name) values ($1, 'yasal', 'X')`, [C]), /check constraint/, 'ayrılmış adres (yasal) reddedildi');
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

// e-posta bildirimleri
const notes = async (id) =>
  (await db.query(`select kind, recipient, email from notifications where appointment_id = $1 order by kind, recipient`, [id])).rows
    .map((r) => `${r.kind}:${r.recipient}:${r.email}`).join(' ');
let n = await notes(apptId);
ok(n === 'booked:business:a@x.com booked:customer:c@x.com cancelled:business:a@x.com', `girişli müşteri: hesap e-postasına bildirim, iptali işletmeye: ${n}`);
ok(await notes(guest) === 'booked:business:a@x.com', 'e-postasız misafire bildirim yok, işletmeye var');
ok((await db.query(`select count(*)::int c from notifications n join appointments a on a.id = n.appointment_id where a.customer_name = 'x'`)).rows[0].c === 0, 'işletmenin elle eklediği randevuya bildirim yok');
ok((await as(A, `select id from notifications`)).rows.length === 0 && (await as(C, `select id from notifications`)).rows.length === 0, 'bildirim kuyruğu istemciye kapalı');

const wednesday = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 2 * 864e5).toISOString().slice(0, 10);
const bookMail = (t, email) =>
  as(null, `select b->>'id' as id from book_appointment($1, $2, null, $3, 'Misafir Kişi', '05551112244', '', $4) b`, [biz, svc30, t, email]);
await expectError(() => bookMail(`${wednesday}T06:00:00Z`, 'yanlis-eposta'), /e-posta/, 'geçersiz e-posta reddedildi');
await as(A, `update businesses set auto_confirm = false where id = $1`, [biz]);
const mailed = (await bookMail(`${wednesday}T06:00:00Z`, ' Misafir@Ornek.com ')).rows[0].id;
ok((await db.query(`select customer_email from appointments where id = $1`, [mailed])).rows[0].customer_email === 'misafir@ornek.com', 'misafir e-postası küçük harfle kaydedildi');
await as(A, `update appointments set status = 'confirmed' where id = $1`, [mailed]);
await as(A, `update appointments set status = 'cancelled' where id = $1`, [mailed]);
await as(A, `update businesses set auto_confirm = true where id = $1`, [biz]);
n = await notes(mailed);
ok(n === 'booked:business:a@x.com booked:customer:misafir@ornek.com cancelled:customer:misafir@ornek.com confirmed:customer:misafir@ornek.com',
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
ok(await hasReminder(r24) && await hasReminder(r2) && !(await hasReminder(rSoon)) && !(await hasReminder(rLate)), 'hatırlatma zamanlaması doğru');

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

// işletmenin girişli müşteriye eklediği randevu; hatırlatması da uygulama içi bildirim olarak gider
const remindC = (await as(A, `insert into appointments (business_id, customer_id, service_name, customer_name, customer_phone, starts_at, ends_at, status, created_at)
  values ($1, $2, 'Saç Kesimi', 'Cem Yılmaz', '05559990000', now() + interval '20 hours', now() + interval '20 hours 30 minutes', 'confirmed', now() - interval '2 days') returning id`, [biz, C])).rows[0].id;
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
const later = (await book(null, svc30, `${thursday}T09:00:00Z`, 'Misafir Kişi')).rows[0].id;
ok((await asService(`select * from claim_push(100)`)).rows.length === 0
  && (await db.query(`select push_status from inbox where appointment_id = $1`, [later])).rows[0].push_status === 'skipped',
  'telefonu kayıtlı olmayan kullanıcının push\'u atlandı');
await as(C, `select unregister_push_token('ExponentPushToken[ortak]')`);
ok(Object.keys(await owners()).length === 0, 'çıkışta adres silindi');
await db.query(`delete from appointments where id = any($1)`, [[pend, remindC, later]]);

// randevu erteleme
const friday = new Date(new Date(`${monday}T12:00:00Z`).getTime() + 4 * 864e5).toISOString().slice(0, 10);
const mv = (await book(C, svc30, `${thursday}T07:00:00Z`)).rows[0].id; // 10:00
const other = (await book(null, svc30, `${thursday}T08:00:00Z`, 'Misafir Kişi')).rows[0].id; // 11:00
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
const flGuest = (await book(null, svc30, `${nextMon}T08:00:00Z`, 'Cem Başka', '+90 555 111 22 33')).rows[0];
ok(flGuest.status === 'pending' && (await row(flGuest.id)).customer_flagged, 'aynı telefonla misafir randevusu da işaretli');
await as(A, `update appointments set status = 'cancelled' where id = $1`, [flGuest.id]);
ok((await row(flGuest.id)).cancelled_by === 'business', 'işletmenin iptali "business" olarak kaydedildi');
await as(A, `update appointments set customer_flagged = false, prior_cancels = 0, cancelled_by = 'customer' where id = $1`, [fl.id]);
const kept = await row(fl.id);
ok(kept.customer_flagged && kept.prior_cancels === 3 && kept.cancelled_by === null, 'işaret ve geçmiş sayıları elle değiştirilemez');
await expectError(() => as(A, `select * from customer_history($1, '05551112233')`, [C]), /permission denied/, 'başkasının geçmişi sorgulanamaz');
const flMail = (await db.query(`select * from claim_notifications(100)`)).rows.find((n) => n.recipient === 'business' && n.kind === 'booked' && n.customer_name === 'Cem Yılmaz' && n.customer_flagged);
ok(flMail && flMail.prior_cancels === 3, 'işletme e-postası uyarı bilgisiyle kuyruktan alındı');

// işletmenin iptalleri sayılmaz, gelmemeler sayılır
const noShowPhone = '0532 123 45 67';
const manual = (t, status) => as(A, `insert into appointments (business_id, staff_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
  values ($1, $2, 'Saç Kesimi', 'Gelmeyen', $3, $4, $4::timestamptz + interval '30 min', $5) returning id`, [biz, staff[0].id, noShowPhone, t, status]).then((r) => r.rows[0].id);
const m1 = await manual(`${nextMon}T09:00:00Z`, 'cancelled');
const m2 = await manual(`${nextMon}T09:30:00Z`, 'cancelled');
const m3 = await manual(`${nextMon}T10:00:00Z`, 'cancelled');
let gl = (await book(null, svc30, `${nextMon}T11:00:00Z`, 'Gelmeyen', noShowPhone)).rows[0];
ok(gl.status === 'confirmed' && !(await row(gl.id)).customer_flagged, 'işletmenin iptal ettiği randevular müşteriye yazılmaz');
await as(A, `update appointments set status = 'no_show' where id = any($1)`, [[m1, m2]]);
const gl2 = (await book(null, svc30, `${nextMon}T11:30:00Z`, 'Gelmeyen', noShowPhone)).rows[0];
const gl2Row = await row(gl2.id);
ok(gl2.status === 'pending' && gl2Row.prior_no_shows === 2 && gl2Row.customer_flagged, `2 kez gelmeyen müşteri işaretli: ${JSON.stringify(gl2Row)}`);
await db.query(`delete from appointments where id = any($1)`, [[c2, c3, fl.id, flGuest.id, m1, m2, m3, gl.id, gl2.id]]);

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
  [`select * from admin_users()`, 'kullanıcı listesi'],
  [`select admin_grant_subscription('${biz}', 'pro', 365)`, 'paket verme'],
  [`select admin_end_subscription('${biz}')`, 'abonelik bitirme'],
  [`select admin_set_suspended('${biz}', true)`, 'askıya alma'],
]) await expectError(() => as(A, sql), /Yetkiniz yok/, `işletme sahibi admin ${label} yapamaz`);
ok((await as(A, `update plans set price = 1 where id = 'pro' returning id`)).rows.length === 0, 'işletme sahibi paket fiyatı değiştiremez');

ok((await as(ADM, `select id from businesses`)).rows.length === 1 && (await as(ADM, `select id from appointments`)).rows.length > 0
  && (await as(ADM, `select id from payments`)).rows.length === 2 && (await as(ADM, `select id from profiles`)).rows.length === 5,
  'yönetici tüm işletme, randevu, ödeme ve profilleri görür');
const users = (await as(ADM, `select * from admin_users()`)).rows;
ok(users.length === 5 && users.find((u) => u.id === A).business_name === 'Ahmet Berber' && users.find((u) => u.id === ADM).is_admin, `kullanıcı listesi: ${users.length} kişi, işletme ve admin bilgisiyle`);

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
const stats = (await as(ADM, `select admin_stats() s`)).rows[0].s;
ok(stats.users === 6 && stats.businesses === 2 && stats.active === 1 && stats.trial === 1 && stats.never_paid === 1
  && Number(stats.mrr) === 749 && Number(stats.revenue_total) === 449 + 249 + 1500
  && stats.daily.length === 30 && stats.by_plan.find((p) => p.id === 'pro').count === 1,
  `istatistikler (deneme ayrı): ${JSON.stringify({ u: stats.users, b: stats.businesses, active: stats.active, trial: stats.trial, never: stats.never_paid, mrr: stats.mrr, rev: stats.revenue_total })}`);
await db.query(`delete from businesses where id = $1`, [bizB]);

await as(ADM, `select admin_set_suspended($1, true)`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 0 && (await slots(svc30, tuesday)).length === 0, 'askıdaki işletme gizli ve randevu almaz');
await as(A, `update businesses set is_suspended = false where id = $1`, [biz]);
ok((await db.query(`select is_suspended from businesses where id = $1`, [biz])).rows[0].is_suspended === true, 'işletme sahibi askıyı kaldıramaz');
await as(ADM, `select admin_set_suspended($1, false)`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 1, 'askıdan çıkınca tekrar görünür');

await as(ADM, `select admin_end_subscription($1)`, [biz]);
ok((await as(null, `select id from businesses`)).rows.length === 0, 'yönetici aboneliği bitirince işletme yayından düştü');

await as(ADM, `update plans set price = 999, staff_limit = 10 where id = 'pro'`);
await as(ADM, `insert into plans (id, name, price, staff_limit, sort_order) values ('kurumsal', 'Kurumsal', 1999, null, 4)`);
ok((await as(null, `select price::int p from plans where id = 'pro'`)).rows[0].p === 999 && (await as(null, `select id from plans`)).rows.length === 4, 'yönetici paket fiyatını değiştirdi ve yeni paket ekledi');
await expectError(() => as(ADM, `update plans set price = 0 where id = 'pro'`), /check constraint/, 'sıfır fiyat reddedildi');

// bakiye: PayTR ile yüklenir, paket almak için kullanılır, nakit olarak çekilemez
const balance = async (uid) => Number((await as(uid, `select business_balance($1) b`, [biz])).rows[0].b);
await expectError(() => as(A, `select * from create_topup(30)`), /50 ile 10.000/, 'çok küçük yükleme reddedildi');
await expectError(() => as(A, `select * from create_topup(100.5)`), /tam sayı/, 'kuruşlu yükleme reddedildi');
await expectError(() => as(C, `select * from create_topup(100)`), /Önce işletmenizi/, 'işletmesi olmayan bakiye yükleyemez');
const top = (await as(A, `select * from create_topup(500)`)).rows[0];
ok((await db.query(`select plan_id from payments where merchant_oid = $1`, [top.merchant_oid])).rows[0].plan_id === null, 'bakiye yüklemesi paketsiz ödeme kaydı');
const beforeTopup = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
await expectError(() => db.query(`select activate_subscription($1, 400)`, [top.merchant_oid]), /eksik/, 'eksik tutarla yükleme reddedildi');
await db.query(`select activate_subscription($1, 500)`, [top.merchant_oid]);
await db.query(`select activate_subscription($1, 500)`, [top.merchant_oid]);
ok(await balance(A) === 500, 'ödeme bildirimiyle bakiyeye 500 TL eklendi (tekrar gelen bildirim eklemez)');
const afterTopup = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
ok(afterTopup.plan_id === beforeTopup.plan_id && afterTopup.subscription_ends_at.getTime() === beforeTopup.subscription_ends_at.getTime(), 'bakiye yüklemesi aboneliği değiştirmez');
ok(await balance(C) === 0 && (await as(C, `select id from balance_transactions`)).rows.length === 0, 'başkası bakiyeyi ve hareketleri göremez');
await expectError(() => as(A, `insert into balance_transactions (business_id, amount, kind) values ($1, 1000, 'admin')`, [biz]), /row-level security/, 'işletme sahibi bakiye ekleyemez');
ok((await as(A, `update balance_transactions set amount = 9999 returning id`)).rows.length === 0
  && (await as(A, `delete from balance_transactions returning id`)).rows.length === 0, 'işletme sahibi bakiye hareketini değiştiremez veya silemez');

await expectError(() => as(A, `select buy_plan_with_balance('pro')`), /yetersiz/, 'bakiyenin yetmediği paket alınamaz');
await as(A, `select buy_plan_with_balance('baslangic')`);
const bought = (await db.query(`select plan_id, subscription_ends_at from businesses where id = $1`, [biz])).rows[0];
const boughtDays = (bought.subscription_ends_at - Date.now()) / 864e5;
ok(bought.plan_id === 'baslangic' && boughtDays > 29.9 && boughtDays < 30.1 && await balance(A) === 251, `bakiyeden Başlangıç paketi alındı: ${boughtDays.toFixed(2)} gün, bakiye ${await balance(A)} TL`);

await expectError(() => as(A, `select admin_adjust_balance($1, 100, 'iade')`, [biz]), /Yetkiniz yok/, 'işletme sahibi bakiye düzeltemez');
await expectError(() => as(ADM, `select admin_adjust_balance($1, -300, 'düzeltme')`, [biz]), /eksiye/, 'bakiye eksiye düşürülemez');
await expectError(() => as(ADM, `select admin_adjust_balance($1, 100, '  ')`, [biz]), /Açıklama/, 'açıklamasız düzeltme reddedildi');
await as(ADM, `select admin_adjust_balance($1, 49, 'Hizmet kesintisi telafisi')`, [biz]);
const moves = (await as(A, `select kind, amount::int a from balance_transactions`)).rows;
ok(await balance(ADM) === 300 && await balance(A) === 300 && moves.length === 3
  && ['topup:500', 'plan:-249', 'admin:49'].every((m) => moves.some((x) => `${x.kind}:${x.a}` === m)),
  'yönetici bakiye ekledi; hareketler: yükleme, paket, telafi');

console.log(failures ? `\n${failures} TEST BAŞARISIZ` : '\nTÜM TESTLER GEÇTİ');
process.exit(failures ? 1 : 0);
