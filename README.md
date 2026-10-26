# SiftahGo

Esnaf (berber, kuaför, güzellik salonu, oto yıkama, halı saha…) için online randevu ve takvim yönetimi.

| Klasör      | Ne var                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| `supabase/` | Veritabanı şeması (`schema.sql`) ve testleri                           |
| `web/`      | Next.js sitesi: tanıtım, işletme arama, randevu sayfası, işletme paneli, PWA |
| `mobile/`   | Expo (React Native) iOS/Android uygulaması                             |

Web ve mobil aynı Supabase veritabanını kullanır. Randevu kuralları (boş saat hesabı,
çakışma engeli, iptal) veritabanındaki fonksiyonlardadır; iki uygulama da aynı kuralı kullanır.

## Kurulum

### 1. Veritabanı

Supabase panelinde **SQL Editor**'ü açın, `supabase/schema.sql` dosyasının tamamını yapıştırıp çalıştırın.
Dosya eski tabloları silip yeni şemayı kurar; istediğiniz kadar tekrar çalıştırılabilir.

Şemayı Supabase'e göndermeden yerelde denemek için:

```bash
npm install
npm run test:db
```

Supabase ayarları:

- **Authentication > URL Configuration**: *Site URL* sitenizin adresi olmalı; *Redirect URLs* listesine
  `https://ALAN-ADINIZ/auth/callback` ve geliştirme için `http://localhost:3000/auth/callback` ekleyin.
- E-posta doğrulamasını geliştirme sırasında kapatmak isterseniz: **Authentication > Sign In / Providers > Email > Confirm email**.

#### Hesap e-postaları (doğrulama, şifre sıfırlama)

Supabase'in kendi e-posta servisi saatte birkaç e-posta gönderir ve sadece proje ekibine teslim eder;
gerçek kullanıcılar için Resend SMTP kullanın:

1. **Authentication > Emails > SMTP Settings** → *Enable custom SMTP*: Host `smtp.resend.com`, Port `465`,
   Username `resend`, Password: Resend API anahtarı, Sender email: `EMAIL_FROM`'daki adres, Sender name `SiftahGo`.
2. **Authentication > Emails > Templates**: `supabase/email-templates` içindeki dosyaları yapıştırın
   (*Confirm signup* → `confirm-signup.html`, *Reset password* → `reset-password.html`,
   *Change email address* → `change-email.html`; güvenlik bildirimleri: *Password changed* → `password-changed.html`,
   *Email address changed* → `email-changed.html`). Bağlantılar `/auth/confirm`'e gider; e-posta başka cihazda
   veya mobil uygulamadan kayıttan sonra açılsa da çalışır.
3. **Authentication > Rate Limits**: saatlik e-posta sınırını ihtiyaca göre artırın.

#### Google ile giriş

1. [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > **OAuth consent screen**: uygulama adı SiftahGo,
   destek e-postası; kapsamlar `email`, `profile`, `openid`. Yayın durumunu *In production* yapın.
2. **Credentials > Create credentials > OAuth client ID** > *Web application*. *Authorized redirect URIs*:
   `https://SUPABASE-PROJE.supabase.co/auth/v1/callback`
3. Supabase > **Authentication > Sign In / Providers > Google**: açın, Client ID ve Client Secret'ı yapıştırın.
4. Supabase > **Authentication > URL Configuration > Redirect URLs**: mobil uygulama için `siftahgo://auth/callback` ekleyin.

5. Android'de uygulama içi giriş için aynı projede **Create credentials > OAuth client ID** > *Android*: paket adı
   `com.siftahgo.app`, SHA-1 olarak APK'yı imzalayan anahtarınki (`npx eas-cli credentials -p android`). Web istemcisinin
   kimliği `mobile/eas.json`'da `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`'dir; Android istemcisinin kimliği bir yere yazılmaz.

Android'de Google hesabı uygulamanın içinde seçilir; Android istemcisi yoksa ya da Play Hizmetleri yoksa giriş tarayıcıda açılır.

### 2. Web

```bash
cd web
cp .env.example .env.local   # değerleri doldurun
npm install
npm run dev
```

R2 bucket'ı için herkese açık erişim (r2.dev veya özel alan adı) açık olmalı ve adresi
`CLOUDFLARE_R2_PUBLIC_URL` değişkenine yazılmalı. Görseller sunucu üzerinden yüklendiği için CORS ayarı gerekmez.

### Paketler ve PayTR

İşletmeler ücretli paketle çalışır; aktif paketi olmayan işletme yayında görünmez ve randevu almaz.
Paket adları, fiyatları ve personel sınırları veritabanındaki `plans` tablosundadır
(Supabase > Table Editor > plans); değiştirdiğinizde site ve ödeme tutarı birlikte güncellenir.

1. Ortam değişkenleri: `SUPABASE_SERVICE_ROLE_KEY`, `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`,
   `PAYTR_TEST_MODE` (`1` = test ödemesi, canlıda `0`).
2. PayTR Mağaza Paneli > Ayarlar > **Bildirim URL**: `https://ALAN-ADINIZ/api/paytr/callback`
3. Her başarılı ödeme 30 gün ekler; aynı bildirim tekrar gelirse süre iki kez uzamaz.

### E-posta bildirimleri (Resend)

Randevu alınınca işletmeye ve müşteriye, işletme onaylayınca veya iptal edince müşteriye, müşteri iptal edince
işletmeye e-posta gider; müşteriye randevudan önce hatırlatma gönderilir (önceden alınan randevuya 24 saat,
aynı gün alınana 2 saat kala). Müşteri e-postası girişli kullanıcıda hesap e-postasıdır; misafir randevu
formunda isteğe bağlı yazar. E-postalar veritabanındaki `notifications` kuyruğuna girer, `/api/notifications`
kuyruğu boşaltır.

1. [resend.com](https://resend.com)'da alan adınızı doğrulayın ve bir API anahtarı oluşturun.
2. Ortam değişkenleri: `RESEND_API_KEY`, `EMAIL_FROM` (örn. `SiftahGo <bildirim@siftahgo.com>`),
   `CRON_SECRET` (uzun, rastgele bir metin), `NEXT_PUBLIC_APP_URL`.
3. Supabase > Database > Extensions'tan **pg_cron** ve **pg_net**'i açın, SQL Editor'de şunu çalıştırın
   (adresi ve anahtarı kendi değerlerinizle değiştirin). Kuyruk dakikada bir boşaltılır:

```sql
select cron.schedule(
  'siftahgo-bildirimler',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://ALAN-ADINIZ/api/notifications',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET_DEĞERİNİZ'),
    timeout_milliseconds := 30000
  );
  $$
);
```

Görevi kaldırmak için: `select cron.unschedule('siftahgo-bildirimler');`. Gönderilemeyen e-postalar
5 kez denenir; durumlarını Table Editor > notifications'ta (`status`, `last_error`) görebilirsiniz.

### 3. Mobil

```bash
cd mobile
cp .env.example .env.local   # Supabase adresi ve anon anahtarı
npm install
npx expo start
```

Telefonda **Expo Go** ile QR kodu okutarak deneyebilirsiniz. `.env.local` web ile **aynı** Supabase projesini göstermeli.

Derlemeler (`mobile/eas.json`; Supabase adresi ve canlı site adresi profilde yazılı):

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview      # siteden indirilecek APK
npx eas-cli@latest build --platform android --profile production   # Play Store (AAB)
npx eas-cli@latest build --platform ios --profile production       # App Store
```

#### Siteye indirme bağlantıları

Ana sayfadaki "Mobil uygulama" bölümü (`/#uygulama`) şu ortam değişkenlerini kullanır; boş olan "Yakında" görünür:
`NEXT_PUBLIC_ANDROID_APK_URL`, `NEXT_PUBLIC_PLAY_STORE_URL`, `NEXT_PUBLIC_APP_STORE_URL`.
APK GitHub Releases'ta yayınlanır; `NEXT_PUBLIC_ANDROID_APK_URL` her zaman en yeni sürümü veren
`https://github.com/TikziiBaba/SiftahGo/releases/latest/download/siftahgo.apk` adresidir. Yeni sürüm için
`preview` derlemesinin APK'sını indirip dosya adı `siftahgo.apk` olacak şekilde yayınlayın (site değişmeden yeni dosyayı verir):

```bash
gh release create v1.0.1 siftahgo.apk --title "SiftahGo 1.0.1" --notes "..."
```

### 4. Yönetim paneli

`/admin`: platform özeti, işletme başvuruları (onay/ret), işletmeler (paket tanımlama/süre uzatma, aboneliği bitirme,
askıya alma), kullanıcılar, ödemeler, randevular ve paket fiyatları. Yöneticiler `admins` tablosundaki e-postalardır (şemada
`dedyusuf99@gmail.com`); hesabın e-postası doğrulanmış olmalı. Yeni yönetici eklemek için SQL Editor'de:
`insert into public.admins (email) values ('ornek@alan.com');`

Yeni işletme "onay bekliyor" açılır: sahibi onaylanana kadar yalnızca bekleme ekranını görür, işletme sitede görünmez,
randevu ve ödeme almaz. Yetkili `/admin/basvurular`'da adres ve telefonu kontrol edip onaylar (7 günlük Pro deneme o an
başlar) ya da sebebini yazarak reddeder; reddedilen işletme bilgilerini düzeltip yeniden başvurur.

Askıya alınan işletme sitede ve uygulamada görünmez, randevu almaz; sahibi bunu ayarlardan geri açamaz.
Yöneticinin tanımladığı paketler ödeme geçmişinde `ADM` ile başlayan kayıt olarak görünür.

## Özellikler

**Müşteri:** işletme arama (kategori, şehir, puan), hizmet → personel → gün → saat seçerek randevu,
misafir veya hesapla randevu, e-posta ile onay/iptal bildirimi ve hatırlatma, Google Takvim'e ekleme, randevularım, iptal, tekrar randevu,
tamamlanan randevuya puan ve yorum, şifremi unuttum.

**İşletme (web paneli):**
- Randevular: günlük liste, durum yönetimi (onay, tamamlandı, gelmedi, iptal), elle randevu ekleme,
  WhatsApp ile hatırlatma, yeni randevular anında görünür, yeni randevu ve iptallerde e-posta
- Müşteriler: telefon numarasına göre müşteri defteri (ziyaret, harcama, gelmeme, son/sıradaki randevu)
- Raporlar: ciro, randevu sayısı, ortalama sepet, gelmeme oranı, günlük ciro grafiği, hizmet ve personel dağılımı
- Hizmetler, personel (hangi personelin hangi hizmeti verdiği), çalışma saatleri, izin/tatil günleri
- Randevu kuralları (saat aralığı, en erken/en geç), logo/kapak/galeri (R2), QR kod
- Randevu onayı: hepsini otomatik / tanıdık müşteriyi (sizde randevusu tamamlanmış) otomatik, yeni müşteriyi elle /
  hepsini elle. Gelen randevuda müşteri kartı (üyelik, bu işletmedeki ve tüm SiftahGo'daki geçmiş, yazdığı yorumlar);
  sebebiyle reddetme veya iptal (sebep müşteriye e-posta ve bildirimle gider), istenirse müşteriyi engelleme

**İşletme (mobil):** web panelindeki işlerin tamamı uygulamada da var: işletme kurulumu, takvim (hafta görünümü,
onay bekleyenler, durum yönetimi, elle randevu ekleme, canlı güncelleme), müşteri defteri, raporlar, hizmetler, personel,
çalışma saatleri ve izinler, işletme bilgileri ve randevu kuralları, görseller, QR kod ve bağlantı paylaşımı.
Ödeme (PayTR) web sitesinde yapılır; uygulama abonelik sayfasını tarayıcıda açar. Görseller sitedeki `/api/upload`
adresine yüklenir (uygulama oturumu `Authorization: Bearer` başlığıyla gönderir), bu yüzden mobilde
`EXPO_PUBLIC_WEB_URL` canlı siteyi göstermelidir.
