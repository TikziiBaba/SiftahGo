# Kupon, gecikme haberi ve vitrin sayfası

Tarih: 2026-11-02. Durum: onay bekliyor.

## Amaç

SiftahGo bugün yalnızca randevuyla çalışan esnafa yarıyor. Üç ekleme hem mevcut esnafa yeni bir değer verir hem de
kitleyi büyütür:

1. **Gecikme haberi:** Müşteri ve esnaf birbirine "geciktim" diyebilir, kimse dükkânda ya da yolda boşuna beklemez.
2. **Kupon:** Esnaf gerçek indirim tanımlar. Müşteri dükkâna gelmek için sebep bulur, esnaf kuponun kaç müşteri
   getirdiğini görür.
3. **Vitrin:** Lokanta, market gibi randevuyla çalışmayan esnaf menü/ürün listesi ve kuponla sayfa açar.

## Kapsam

Kapsamda: yukarıdaki üç özellik; web, mobil ve veritabanı.

Kullanıcı kararıyla kapsam dışı: online sipariş, kurye, masa rezervasyonu, stok takibi.

Olmaması gerekenler:
- Para platformdan geçmez; indirim dükkânda uygulanır. Komisyon yoktur.
- Sistem WhatsApp veya SMS göndermez (daha önceki kullanıcı kararı).
- Vitrin esnafı randevu ile ilgili hiçbir ekran veya uyarı görmez. Mevcut randevulu esnafın akışı bozulmaz.

## 1. Gecikme haberi

**Müşteri:** Yaklaşan randevusunda "Gecikiyorum" der ve 5, 10 veya 15 dakika seçer.
- Başlangıçtan 2 saat önce açılır, randevu bitince kapanır.
- Yalnızca `pending` ve `confirmed` randevularda çalışır.
- Esnafa anlık bildirim gider. Takvimde ve "sıradaki müşteri" alanında "10 dk gecikiyor" görünür.

**Esnaf:** Bugünkü takvimden "Sarktık" der ve 10, 15, 30 veya 45 dakika seçer.
- Haber, seçilen personelin (tek personelse doğrudan onun) önümüzdeki 3 saat içindeki aktif randevularına gider.
- Müşteriye anlık bildirim ve e-posta gider. Randevu kartında "Yaklaşık 15 dk gecikme" görünür.

**Kurallar:**
- Randevu saati değişmez. `starts_at`, `ends_at`, boş saat hesabı ve çakışma kuralı aynı kalır.
- Her randevuda taraf başına en fazla 3 haber verilir, sonuncusu geçerlidir.
- Haber yalnızca randevunun tarafları tarafından verilebilir (RPC + `auth.uid()`).

**Teslim:** `inbox` tablosuna yeni tür yazılmaz. `mobile/src/app/bildirimler.tsx:144` bilinmeyen türde çöktüğü için
eski APK'lar etkilenir. `claim_waitlist` örneğindeki gibi anlık bildirim + e-posta kullanılır.

## 2. Kupon

**Paketler:** Esnaf, Pro ve Vitrin paketlerinde vardır, Başlangıç'ta yoktur. Özellik adı `coupons`, kontrol
`plan_has_feature` ile yapılır. Paket düşerse kuponlar silinmez, gizlenir (duyuru bandındaki kural).

**Esnaf kupon tanımlar:**
- Başlık, indirim türü (yüzde veya sabit ₺) ve değer
- Başlangıç ve bitiş tarihi; en uzun 90 gün
- İsteğe bağlı günler ve saat aralığı (örnek: hafta içi 12.00–15.00)
- İsteğe bağlı toplam kullanım sınırı
- Randevulu işletmede: tüm hizmetler ya da seçili hizmetler
- Durdurma; kullanılmış kupon silinmez, durdurulur

**Müşteri kuponu alır:**
- İşletme sayfasında kuponu görür. "Kuponu al" için giriş zorunludur.
- Hesabına özel 6 haneli kod oluşur. Aynı kupon kişi başına bir kez alınır.
- Kupon, Hesabım'da yeni "Kuponlarım" bölümünde durur (web ve mobil).

**Vitrin işletmesinde kullanım:** Müşteri kodu kasada gösterir. Esnaf panelde ya da uygulamada kodu girer, kuponun
adını ve indirimini görür, "Kullanıldı" der. QR okutma ilk sürümde yoktur: kamera paketi yeni APK gerektirir.

**Randevulu işletmede kullanım:**
- Müşteri randevu alırken alınmış ya da alınabilir kuponu seçer, indirimli fiyatı görür.
- `appointments.price` indirimli fiyat olur. Liste fiyatı ve kupon bağlantısı ayrı kolonlarda saklanır.
- Randevu tamamlanınca kupon kullanılmış sayılır. İptal olursa ya da müşteri gelmezse kupon müşteriye döner.
- Esnaf randevulu müşteride de kasada kod girebilir.
- Seans paketinden düşen randevuda kupon kullanılamaz.
- Ertelemede yeni saat kuponun gün ve saat aralığı dışındaysa erteleme hata verir ve sebebi yazar. Müşteri iptal
  edip yeniden randevu alabilir.
- `get_available_slots` değişmez. Kuponun geçerlilik kuralları `book_appointment` içinde sunucuda denetlenir.

**Kullanılmış sayılma:** Randevuya bağlı kuponun durumu ayrı bir işle yazılmaz, randevudan hesaplanır. Randevu
`completed` ise ya da `confirmed` olup `ends_at` geçmişse kullanılmıştır; bu, `add_review` ile aynı kuraldır. Sonradan
`no_show` veya `cancelled` olursa kupon kendiliğinden müşteriye döner. Randevu kuponlu müşterinin yorumu `add_review`
ile yazılır.

**Kullanım sınırı:** Toplam sınır kupon alınırken sayılır, satır kilidiyle aşılamaz. Dönen kupon müşteride kalır ve
sınırdan yer açmaz. Süresi dolan kullanılmamış kupon da yer açmaz.

**Değişiklikler:**
- Bitiş tarihi geçmiş ya da durdurulmuş kupon yeni müşteriye verilmez.
- Durdurmadan önce alınmış kodlar bitiş tarihine kadar geçerlidir, çünkü esnaf onlara söz vermiştir.
- İlk alımdan sonra indirim türü, değeri, gün ve saat aralığı ve hizmetler kilitlenir. Başlık düzenlenebilir, bitiş
  tarihi uzatılabilir, sınır yükseltilebilir. Kupon yalnızca hiç alınmamışsa silinir.

**Fiyat:**
- Yüzde indirim 1–90 arasındadır.
- İndirim randevudaki hizmetin fiyatına uygulanır, kuruş düzeyinde yuvarlanır.
- Sabit indirim fiyatı aşarsa fiyat 0 olur.
- Fiyatı 0 olan hizmette kupon seçilemez.
- Kuponlu randevu seans paketinden düşmez.

**Kod:**
- Kod işletme içinde benzersizdir.
- Kasada girilen kod bitmiş kuponda ya da gün ve saat aralığı dışında reddedilir, sebebi yazar.
- Aynı kod ikinci kez girilirse "zaten kullanıldı" yanıtı alınır, sayı değişmez.
- Esnaf yanlış işaretlemeyi 10 dakika içinde geri alabilir.
- 10 dakikada 20 yanlış kod denemesinden sonra giriş kısa süre durur.

**Esnaf raporu:** Kupon listesinde her kupon için alınan ve kullanılan sayısı görünür.

**Güvenlik:** Kodu yalnızca kuponun ait olduğu işletmenin sahibi kullanılmış sayabilir. Müşteri fiyat veya kod durumu
yazamaz; bütün yazmalar RPC üzerinden yapılır. Tablolarda RLS açıktır.

## 3. Vitrin

**İşletme türü:** `businesses` tablosuna `business_type` (`appointment` varsayılan, `showcase`) eklenir. Tür kayıtta
seçilir: "Randevuyla çalışıyorum / Çalışmıyorum". Sahibi sonradan kendi değiştiremez; `protect_business_columns`
bunu korur. Yönetici mevcut işletme düzenleme ekranından değiştirir:
- Yaklaşan aktif randevu varsa değişiklik reddedilir.
- Hizmet, personel, menü ve kupon kayıtları silinmez, yalnızca gizlenir.
- Abonelik süresi korunur. Paket vitrine geçişte `vitrin`, randevuya geçişte `baslangic` olur.

**Değişmeyenler:** Yönetici onayı, abonelik süresi, askı, sayfa adresi, kapak ve galeri, duyuru, WhatsApp/Instagram
kısayolları, QR ve afiş (`/[slug]/afis`) vitrin için de geçerlidir.

**Çalışma saatleri kalır.** Sayfadaki "Açık / Kapalı" buradan hesaplanır. Saat ekranı sadeleşir: yalnızca açılış ve
kapanış, randevu aralığı ayarları olmadan. Hizmet, personel, takvim, müşteri defteri, randevu kuralları ve izin
ekranları gizlenir. `business_after_insert` vitrin için personel kaydı açmaz.

**Menü / ürün listesi:** Yeni `menu_items` tablosu: kategori adı, ürün adı, açıklama, fiyat, isteğe bağlı fotoğraf,
görünürlük, sıra.
- İşletme başına en fazla 200 ürün
- Fotoğraflar R2'ye `businesses/<id>/menu/` altına gider; `is_upload_url` kuralı ve `/api/upload` buna göre genişler.
- Ekranda ad "Menü" (lokanta, kafe, fırın) ya da "Ürünler" (diğerleri) olur.

**Sayfa:** `/[slug]` türe göre vitrin görünümünü açar. Sıralama onaylanan B örneğine göre: kapak, durum, Ara /
WhatsApp / Yol tarifi, kuponlar, menü, fotoğraflar, yorumlar. Yapısal veri `LocalBusiness` yerine uygun türü kullanır
(`Restaurant`, `GroceryStore` vb.). Web ve mobilde aynıdır.

**Panel:** Vitrin esnafının ilk ekranı kupon sayıları, son kullanımlar ve kurulum listesidir. Menüde: Bilgiler, Menü,
Kuponlar, Saatler, Yorumlar, QR, Abonelik, Destek. Uygulamada sekmeler de buna göre sadeleşir.

**Keşfet:**
- Vitrin işletmeleri listede ve "Yakınımda"da çıkar; "Bugün müsait"te (`available_today`) çıkmaz.
- Kartta "Randevu al" yerine "Menüyü gör" yazar.
- Yeni kategoriler: Lokanta, Kafe, Fırın & Pastane, Market, Manav & Kasap, Mağaza. Web ve mobil listesi aynı anda
  güncellenir, `category-icons.ts` da.
- Tür ile kategori ayrıdır; randevu alan bir kafe de olabilir.

**Sunucu koruması:** `book_appointment` ve erteleme vitrin işletmesini reddeder. Eski APK'daki bir kullanıcı vitrin
sayfası açarsa randevu alamaz, hata mesajı görür.

**Yorumlar:** Vitrinde yalnızca kupon kullanmış müşteri yorum yazabilir; kullanılmış kupon başına bir yorum.
- `reviews.appointment_id` boş olabilir, yeni `coupon_claim_id` eklenir. İkisinden tam biri dolu olmalıdır.
- `add_review` randevular için aynı kalır; kupon için ayrı bir RPC eklenir.
- Puan hesabı, esnafın cevabı, yönetim ekranı ve hesap silme iki kayıt türünde de çalışmalıdır.
- Kupon kullanıldıktan 2 saat sonra müşteriye "Nasıldı?" anlık bildirim + e-posta gider. Yeni yorum haberi de `inbox`
  dışından gider. Yeni zamanlayıcı kurulmaz: `queue_review_requests` ve `claim_waitlist` gibi `/api/notifications`
  işçisine eklenir.

**Paket:** `plans` tablosuna `vitrin` eklenir: 149 ₺/ay, personel sınırı 1, özellikler
`{coupons,announcement,links,menu}`.
- Fiyat önerilmiş rakamdır, tablodan değiştirilebilir.
- Yıllık ödeme mevcut kuralla çalışır (10 ay fiyatı).
- `create_payment`: vitrin işletmesi yalnızca Vitrin paketini, randevulu işletme yalnızca diğer üç paketi alabilir.
- `admin_review_business`: vitrin işletmesi onayda 2 ay Pro değil, 2 ay Vitrin denemesi alır.
- Davet kodu vitrin için de geçerlidir.

## Mevcut kısıtlar

- `supabase/schema.sql` tek kaynaktır. Yeni ek dosya `supabase/migrations/20261104_*.sql` olur. Eski şema + ek = yeni
  şema doğrulanır, `npm run test:db` geçer.
- `web/src/lib/types.ts` ile `mobile/src/lib/types.ts` ve iki kategori listesi aynı tutulur.
- Web için kod yazmadan önce `node_modules/next/dist/docs/`, mobil için Expo SDK 57 belgeleri okunur (`*/AGENTS.md`).
- Mobil yeni yerel paket eklenmeden yapılır, `npm run update` ile çıkar. Yerel paket gerekirse bu tasarıma dönülür.
- Yayın sırası: SQL canlıya, sonra web, sonra mobil OTA. Canlı SQL ve yayın adımları kullanıcı onayıyla yapılır.
- Yasal metinler: mesafeli satış ve kullanım koşullarına Vitrin paketi ve kupon sorumluluğu (indirimi esnaf uygular),
  gizlilik metnine kupon kullanım verisi eklenir. Kullanıcı gözden geçirir; hukuk onayı kullanıcıdadır.
- `/esnaf` tanıtım sayfası ve paket tablosu Vitrin'i gösterir.

## Teslim sırası

1. Gecikme haberi: bağımsızdır, en küçük parçadır.
2. Kupon: önce randevulu esnaf, kasada kod ile.
3. Vitrin: kupona bağlıdır.

Her parça kendi başına yayınlanabilir.

## Kim karar verdi

**Kullanıcı:** Kupon ve gecikme haberi eklenecek; randevusuz esnaf için menü ve kuponlu vitrin (B örneği); sipariş,
kurye, rezervasyon ve stok kapsam dışı. Kullanıcı önerilen vitrin tanımını kabul etti: kayıtta tür seçimi, Keşfet
davranışı, yalnızca kupon kullananın yorumu, 149 ₺ Vitrin paketi.

**Tasarımı yazanın kararları (kullanıcı henüz görmedi):**
- Çalışma saatleri vitrinde kalır (önceki anlatımda saat ekranı gizlenecek denmişti; "Açık/Kapalı" için gerekli)
- Kupon Esnaf, Pro ve Vitrin'de var, Başlangıç'ta yok
- 6 haneli kod, QR okutma yok
- Randevulu kupon tamamlanınca ya da onaylı randevunun süresi geçince kullanılmış sayılır; iptal ve gelmemede müşteriye döner
- Toplam sınır kupon alınırken sayılır; kullanılmayan kupon yer açmaz
- Alınmış kupon durdurulsa da bitiş tarihine kadar geçerlidir; ilk alımdan sonra indirim koşulları kilitlenir
- Yüzde sınırı 1–90, sabit indirimde en düşük fiyat 0, kuponlu randevu seans paketinden düşmez
- Esnaf yanlış işaretlemeyi 10 dakika içinde geri alabilir
- Türü yalnızca yönetici değiştirir, kayıtlar silinmez
- Gecikme süreleri, 2 saat ve 3 saat pencereleri, en fazla 3 haber
- Gecikme ve vitrin bildirimlerinin `inbox` dışından gitmesi
- Yeni kategoriler ve 200 ürün sınırı

## Uygulayıcıya bırakılanlar

Tablo ve kolon adlarının ayrıntısı, kod üretim yöntemi, RPC bölümlemesi, bileşen yapısı, panel ve Keşfet ekranlarının
görsel ayrıntısı (mevcut tasarım diline uymak koşuluyla).
