# Gecikme Haberi Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Müşteri ve esnaf, randevu saatini değiştirmeden birbirine gecikme haberi verebilsin.

**Architecture:** Haberler `appointments` kolonlarına ve `delay_notices` kuyruğuna yazılır. Dakikada bir çalışan `/api/notifications` işçisi kuyruğu anlık bildirim ve e-posta olarak gönderir. `inbox` kullanılmaz.

**Tech Stack:** Postgres/Supabase (test: PGlite), Next.js 16, Expo SDK 57.

**Spec:** `docs/superpowers/specs/2026-11-02-kupon-gecikme-vitrin-design.md` (bölüm 1)

## Global Constraints

- `supabase/schema.sql` tek kaynaktır; yeni tablolar baştaki `drop table` listesine de eklenir. Ek dosya: `supabase/migrations/20261104_gecikme.sql`.
- `web/src/lib/types.ts` ile `mobile/src/lib/types.ts` aynı tutulur.
- Web kodundan önce `web/node_modules/next/dist/docs/` ilgili bölümü, mobil koddan önce Expo SDK 57 belgeleri okunur.
- Yeni yerel mobil paket eklenmez. `mobile/src/lib/changelog.json` yeni kayıt alır.
- Çalışma `main` üzerinde yapılmaz; dal: `gecikme-haberi`. Canlı SQL ve yayın bu planın dışındadır, kullanıcı onayı ister.

## Review Focus

- Başka müşterinin randevusuna haber: reddedilir. Task 1 testi.
- Esnafın doğrudan tablo yazmasıyla gecikme sayacını sıfırlaması: yazma yok sayılır. Task 1 testi.
- Sonradan iptal edilen randevunun bekleyen haberi: gönderilmez. Task 1 testi.
- Hiç uygun randevu yokken "Sarktık": hata değil, "0 müşteriye haber verildi". Task 1 testi ve Task 3 arayüzü.
- Bildirim izni olmayan web müşterisi: esnaf gecikmesi e-postayla da ulaşır, randevu kartında görünür. Task 2 ve Task 3.

---

### Task 1: Veritabanı

**Files:**
- Modify: `supabase/schema.sql`, `supabase/test/schema.test.mjs`
- Create: `supabase/migrations/20261104_gecikme.sql`, `supabase/test/migration-check.mjs`

**Interfaces:**
- Produces:
  - `appointments`: `customer_late_minutes int` (5, 10, 15), `customer_late_at timestamptz`, `customer_late_count smallint default 0`, `business_delay_minutes int` (10, 15, 30, 45), `business_delay_at timestamptz`, `business_delay_count smallint default 0`
  - `report_customer_late(p_id uuid, p_minutes int) returns void`
  - `report_business_delay(p_staff_id uuid, p_minutes int) returns int` (haber verilen randevu sayısı)
  - `claim_delay_notices(p_limit int default 50) returns table (id uuid, recipient text, minutes int, email text, customer_name text, business_name text, business_slug text, service_name text, starts_at timestamptz, tokens text[])`

- [ ] **Step 1: Şu testleri `schema.test.mjs` sonundaki sonuç satırından önce ekle**

Kendi işletme ve müşterilerini açsın; önceki bölümlerin sınırlarına takılmasın.

```js
// report_customer_late
await expectError(() => as(BASKA, `select report_customer_late($1, 10)`, [aptGelecek]), /gecikme haberi/i, 'başkasının randevusu');
await expectError(() => as(MUSTERI, `select report_customer_late($1, 7)`, [aptYakin]), /5, 10 veya 15/, 'geçersiz süre');
await expectError(() => as(MUSTERI, `select report_customer_late($1, 10)`, [aptUzak]), /2 saat/, 'erken haber');
await as(MUSTERI, `select report_customer_late($1, 10)`, [aptYakin]);
// aptYakin üzerinde customer_late_minutes = 10, count = 1, starts_at ve ends_at değişmemiş
// 3 haberden sonra 4. istek: /en fazla 3/

// report_business_delay
ok((await as(SAHIP, `select report_business_delay($1, 15) n`, [personel])).rows[0].n === 2, '3 saat içindeki iki randevuya');
// 4 saat sonraki, iptal edilmiş ve başka personelin randevusu business_delay_minutes = null kalır
await expectError(() => as(BASKA_SAHIP, `select report_business_delay($1, 15)`, [personel]), /yetki/i, 'başka işletme');
ok((await as(SAHIP, `select report_business_delay($1, 15) n`, [bosPersonel])).rows[0].n === 0, 'randevu yoksa 0');

// doğrudan yazma korunur
await as(SAHIP, `update appointments set business_delay_count = 0 where id = $1`, [aptYakin]);
// count değişmemiş olmalı

// claim_delay_notices
await expectError(() => as(MUSTERI, `select * from claim_delay_notices(10)`), /permission denied/, 'istemciye kapalı');
// customer_late -> recipient 'business', business_delay -> recipient 'customer', email yalnızca 'customer' satırında dolu
// ikinci çağrı aynı satırları döndürmez; randevusu sonradan iptal edilen haber döndürülmez
```

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör**

Run: `npm run test:db`
Expected: `report_customer_late` bulunamadı hatası.

- [ ] **Step 3: Şemayı yaz**

- `delay_notices`: `id`, `appointment_id` (`on delete cascade`), `recipient` (`customer`/`business`), `minutes`, `status` (`pending`/`sent`), `created_at`. RLS açık, politika yok; `drop table` listesine eklenir.
- `report_customer_late`: yalnızca `customer_id = auth.uid()`, `pending`/`confirmed`, `now()` ≥ `starts_at - 2 saat`, `now()` < `ends_at`, sayaç < 3.
- `report_business_delay`: `is_business_owner` kontrolü; o personelin `pending`/`confirmed`, `starts_at` `now()` ile `now()+3 saat` arasındaki ve sayacı 3'ten az randevuları.
- `appointments_before_write`: `current_user in ('anon','authenticated')` için altı kolon eski değerine döner (eklemede boşlanır).
- `claim_delay_notices`: `claim_waitlist` kalıbı (`for update skip locked`, `revoke execute`). Satır alınırken randevu artık `pending`/`confirmed` değilse `sent` yapılır ama döndürülmez. `recipient='business'` için jeton sahibinden, `recipient='customer'` için müşteriden gelir.

- [ ] **Step 4: Testleri geçir**

Run: `npm run test:db`
Expected: `TÜM TESTLER GEÇTİ`

- [ ] **Step 5: `supabase/test/migration-check.mjs` yaz ve ek dosyayı doğrula**

Kullanım: `node supabase/test/migration-check.mjs <git-ref> <ek-dosya>`. PGlite'ta `<git-ref>` şeması + ek dosya ile güncel `schema.sql`'i ayrı kurar; kolonları, kısıtları, indeksleri, `pg_get_functiondef` çıktılarını, tetikleyicileri, politikaları ve `plans` satırlarını karşılaştırır, farkları yazar. Fark varsa çıkış kodu 1 olur. Veri korunumu için eski şemaya örnek satır ekleyip ek dosyadan sonra durduğunu denetler.

Run: `node supabase/test/migration-check.mjs main supabase/migrations/20261104_gecikme.sql`
Expected: `FARK YOK`

- [ ] **Step 6: Commit** (`Veritabanı: gecikme haberi`)

### Task 2: Bildirim işçisi

**Files:**
- Modify: `web/src/lib/push.ts`, `web/src/lib/notification-email.ts`, `web/src/app/api/notifications/route.ts`, `mobile/src/lib/notifications.ts`

**Interfaces:**
- Consumes: `claim_delay_notices`
- Produces: `type DelayNotice`, `sendDelayPushes(supabase, notices: DelayNotice[])`, `buildDelayEmail(notice, appUrl)`

- [ ] **Step 1: `sendWaitlistPushes` ile aynı biçimde `sendDelayPushes` yaz.** `recipient='business'`: başlık `Müşteri gecikiyor`, gövde `<müşteri> · <saat> randevusuna yaklaşık <n> dk gecikecek`. `recipient='customer'`: başlık `Randevunuzda gecikme var`, gövde `<işletme> · <saat> randevunuz yaklaşık <n> dk gecikebilir`. `data.kind='delay'`, `data.recipient`, `data.startsAt`.
- [ ] **Step 2: `buildDelayEmail` yaz.** Yalnızca `recipient='customer'` için, `buildWaitlistEmail` biçiminde.
- [ ] **Step 3: `route.ts`'e ekle.** Anlık bildirim `waitlistPush`'tan hemen sonra, e-posta bekleme listesi döngüsünden sonra aynı 600 ms aralıkla; yanıta `delays` sayısı eklenir.
- [ ] **Step 4: `openNotificationTarget` kontrolü.** `delay` türü özel bir dal gerektirmez: esnaf takvime, müşteri Randevularım'a düşmeli. Davranışı kodu okuyarak doğrula, gerekirse dal ekle.
- [ ] **Step 5: Doğrula.** Run: `npm --prefix web run build; npm --prefix web run lint`. Expected: hatasız.
- [ ] **Step 6: Commit** (`Web: gecikme haberi bildirimleri`)

### Task 3: Web arayüzü

**Files:**
- Create: `web/src/components/delay-actions.tsx`
- Modify: `web/src/lib/types.ts`, `web/src/components/panel-schedule.tsx`, `web/src/components/appointment-ticket.tsx`, `web/src/app/(site)/hesabim/page.tsx`

**Interfaces:**
- Consumes: `report_customer_late`, `report_business_delay`
- Produces: `CustomerLateButton({ appointment })`, `BusinessDelayButton({ staff })`, `delayLabel(appointment): string | null`

- [ ] **Step 1: `Appointment` türüne altı kolonu ekle** (web ve mobil türü aynı anda).
- [ ] **Step 2: Bileşenleri yaz.** Müşteri düğmesi başlangıçtan 2 saat önce ile bitiş arasında görünür; süre seçenekleri 5, 10, 15. Esnaf düğmesi bugünkü takvimde personel başınadır; seçenekler 10, 15, 30, 45; sonuç `<n> müşteriye haber verildi` olarak gösterilir, 0 ise `Önümüzdeki 3 saatte randevu yok`.
- [ ] **Step 3: Rozetleri yerleştir.** Takvim ve sıradaki müşteri: `10 dk gecikiyor`. Müşteri kartı: `Yaklaşık 15 dk gecikme`.
- [ ] **Step 4: Doğrula.** Run: `npm --prefix web run build; npm --prefix web run lint`. Expected: hatasız. Ardından sahte Supabase ile tarayıcıda iki akışı dene (`mcp__Claude_Browser__*`), ekran görüntüsü al.
- [ ] **Step 5: Commit** (`Web: gecikme haberi ekranları`)

### Task 4: Mobil arayüz

**Files:**
- Create: `mobile/src/components/delay-actions.tsx`
- Modify: `mobile/src/components/customer-appointments.tsx`, `mobile/src/components/appointment-sheet.tsx`, `mobile/src/components/appointment-ticket.tsx`, `mobile/src/app/(tabs)/takvim.tsx`, `mobile/src/lib/changelog.json`

**Interfaces:**
- Consumes: Task 1 RPC'leri, Task 3 kuralları ve metinleri
- Produces: `CustomerLateButton`, `BusinessDelayButton`, `delayLabel` (web ile aynı adlar)

- [ ] **Step 1: Web ile aynı kurallarla bileşenleri yaz,** seçim için mevcut `sheet.tsx` kullan.
- [ ] **Step 2: Rozetleri yerleştir, `changelog.json`'a yeni kayıt ekle.**
- [ ] **Step 3: Doğrula.** Run (`mobile/`): `npx tsc --noEmit; npx expo lint`. Expected: hatasız.
- [ ] **Step 4: Commit** (`Mobil: gecikme haberi`)
