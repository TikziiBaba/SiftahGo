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

### 2. Web

```bash
cd web
cp .env.example .env.local   # değerleri doldurun
npm install
npm run dev
```

R2 bucket'ı için herkese açık erişim (r2.dev veya özel alan adı) açık olmalı ve adresi
`CLOUDFLARE_R2_PUBLIC_URL` değişkenine yazılmalı. Görseller sunucu üzerinden yüklendiği için CORS ayarı gerekmez.

### 3. Mobil

```bash
cd mobile
cp .env.example .env.local   # Supabase adresi ve anon anahtarı
npm install
npx expo start
```

Telefonda **Expo Go** ile QR kodu okutarak deneyebilirsiniz. Mağaza derlemesi için:
`npx eas-cli@latest build --platform android` (veya `ios`).

## Özellikler

**Müşteri:** işletme arama (kategori, şehir, puan), hizmet → personel → gün → saat seçerek randevu,
misafir veya hesapla randevu, Google Takvim'e ekleme, randevularım, iptal, tekrar randevu,
tamamlanan randevuya puan ve yorum, şifremi unuttum.

**İşletme (web paneli):**
- Randevular: günlük liste, durum yönetimi (onay, tamamlandı, gelmedi, iptal), elle randevu ekleme,
  WhatsApp ile hatırlatma, yeni randevular anında görünür
- Müşteriler: telefon numarasına göre müşteri defteri (ziyaret, harcama, gelmeme, son/sıradaki randevu)
- Raporlar: ciro, randevu sayısı, ortalama sepet, gelmeme oranı, günlük ciro grafiği, hizmet ve personel dağılımı
- Hizmetler, personel (hangi personelin hangi hizmeti verdiği), çalışma saatleri, izin/tatil günleri
- Randevu kuralları (saat aralığı, en erken/en geç), otomatik onay, logo/kapak/galeri (R2), QR kod

**İşletme (mobil):** günlük randevular, durum değiştirme, müşteriyi arama veya WhatsApp'tan hatırlatma.
Diğer ayarlar web panelinden.
