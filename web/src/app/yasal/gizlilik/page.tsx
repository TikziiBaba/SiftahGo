import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Gizlilik ve KVKK Aydınlatma Metni" };

export default function PrivacyPage() {
  return (
    <LegalPage href="/yasal/gizlilik" title="Gizlilik politikası ve KVKK aydınlatma metni">
      <p>
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca {SITE_DOMAIN} web sitesi ve {SITE_NAME} mobil uygulamasında
        kişisel verilerinizin nasıl işlendiğini açıklar.
      </p>

      <h2>1. Veri sorumlusu</h2>
      <p>
        <strong>{COMPANY.name}</strong> · {COMPANY.address} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> · {COMPANY.phone}
      </p>
      <p>
        Randevu aldığınız işletme, randevunuzu yönetirken ve size hizmet verirken kendi müşteri bilgileri bakımından ayrı bir veri sorumlusudur.
      </p>

      <h2>2. İşlenen veriler</h2>
      <h3>Randevu alan müşteriler</h3>
      <ul>
        <li><strong>Kimlik ve iletişim:</strong> ad soyad, telefon, e-posta (isteğe bağlı).</li>
        <li><strong>Randevu bilgileri:</strong> işletme, hizmet, personel, tarih ve saat, randevu notu, randevunun durumu (onay, iptal, gelmeme) ve iptal edenin kim olduğu.</li>
        <li><strong>Değerlendirmeler:</strong> puanınız, yorumunuz ve randevuda yazdığınız ad.</li>
      </ul>
      <h3>İşletme sahipleri ve personel</h3>
      <ul>
        <li>Ad soyad, telefon, e-posta; işletmenin adı, adresi, iletişim bilgileri, hizmetleri, fiyatları, çalışma saatleri ve personel adları.</li>
        <li>Yüklenen logo, kapak ve galeri görselleri.</li>
        <li>Paket, ödeme ve bakiye kayıtları (tutar, tarih, ödeme numarası). Kart bilgileri bize ulaşmaz; ödeme kuruluşu PayTR tarafından işlenir.</li>
      </ul>
      <h3>Tüm kullanıcılar</h3>
      <ul>
        <li>Hesap ve oturum bilgileri, Google ile girişte Google’ın paylaştığı ad ve e-posta.</li>
        <li>İşlem güvenliği kayıtları: IP adresi, tarayıcı ve cihaz bilgisi, giriş zamanları.</li>
        <li>Uygulamada bildirim izni verdiyseniz cihazınızın bildirim adresi (push token).</li>
      </ul>

      <h2>3. İşleme amaçları ve hukuki sebepler</h2>
      <ul>
        <li>
          Randevunun oluşturulması, işletmeye iletilmesi, onay, değişiklik, iptal ve hatırlatma bildirimlerinin (e-posta ve uygulama bildirimi)
          gönderilmesi; hesabın açılması ve yönetimi. <em>Hukuki sebep: sözleşmenin kurulması ve ifası (KVKK m. 5/2-c).</em>
        </li>
        <li>
          Paket, ödeme ve bakiye işlemleri; muhasebe ve yasal saklama yükümlülükleri. <em>Hukuki sebep: sözleşmenin ifası ve hukuki yükümlülük (m. 5/2-c, ç).</em>
        </li>
        <li>
          <strong>İptal ve gelmeme geçmişi:</strong> İşletmelerin boş kalan randevular nedeniyle zarar görmemesi için, son 6 ayda {SITE_NAME} genelinde
          (hesabınız veya telefon numaranız üzerinden) yaptığınız iptal ve gelmeme sayıları randevu aldığınız işletmeye gösterilir. 3 veya daha
          fazla iptal ya da 2 veya daha fazla gelmeme varsa işletme uyarılır ve randevunuz işletmenin onayına düşer. Hangi işletmede iptal ettiğiniz
          gösterilmez, yalnızca sayılar gösterilir. <em>Hukuki sebep: veri sorumlusunun ve işletmelerin meşru menfaati (m. 5/2-f).</em>
        </li>
        <li>
          Randevudan sonra “Hizmet nasıldı?” değerlendirme isteği gönderilmesi ve değerlendirmelerin işletme sayfasında yayımlanması.
          <em> Hukuki sebep: meşru menfaat (m. 5/2-f) ve verinin ilgili kişinin kendisi tarafından alenileştirilmesi (m. 5/2-d).</em>
        </li>
        <li>
          Platform güvenliği, sahte randevu ve kötüye kullanımın önlenmesi, hataların giderilmesi. <em>Hukuki sebep: hukuki yükümlülük ve meşru menfaat (m. 5/2-ç, f).</em>
        </li>
      </ul>
      <p>Verileriniz reklam amacıyla üçüncü kişilerle paylaşılmaz ve satılmaz. Ticari elektronik ileti (reklam e-postası/SMS) gönderilmez.</p>

      <h2>4. Kimlere aktarılır</h2>
      <ul>
        <li><strong>Randevu aldığınız işletme:</strong> randevu bilgileriniz, iletişim bilgileriniz, notunuz ve yukarıda açıklanan iptal/gelmeme sayılarınız.</li>
        <li><strong>Ödeme kuruluşu:</strong> PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. (ödeme işlemleri).</li>
        <li>
          <strong>Altyapı hizmet sağlayıcıları:</strong> Supabase (veritabanı ve kimlik doğrulama), Vercel (web barındırma), Cloudflare (görsel
          depolama), Resend (e-posta gönderimi), Expo ve Google Firebase (uygulama bildirimleri), Google (Google ile giriş).
        </li>
        <li><strong>Yetkili kamu kurum ve kuruluşları:</strong> kanunen zorunlu olduğunda.</li>
      </ul>
      <p>
        Altyapı hizmet sağlayıcılarının sunucuları yurt dışında bulunabilir. Bu sağlayıcılara aktarım, hizmetin sunulması için gerekli olduğu ölçüde
        ve KVKK’nın 9. maddesinde öngörülen usullere uygun olarak yapılır.
      </p>

      <h2>5. Toplama yöntemi</h2>
      <p>
        Veriler; randevu, kayıt, işletme ve ödeme formlarına yazdıklarınızdan, Google ile girişte Google’dan ve Platform’u kullanırken otomatik
        olarak (oturum ve güvenlik kayıtları) elektronik ortamda toplanır.
      </p>

      <h2>6. Saklama süresi</h2>
      <ul>
        <li>Hesap bilgileri hesabınız açık olduğu sürece saklanır; hesap silinince silinir veya anonim hale getirilir.</li>
        <li>Randevu kayıtları, işletmenin randevu defteri olarak işletme hesabı açık kaldığı sürece saklanır.</li>
        <li>Ödeme, bakiye ve muhasebe kayıtları ilgili mevzuatın öngördüğü süre boyunca saklanır.</li>
        <li>Bildirim adresleri, oturum kapatıldığında veya uygulama kaldırıldığında silinir.</li>
      </ul>

      <h2>7. Haklarınız (KVKK m. 11)</h2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı kişileri bilme,
        eksik veya yanlışsa düzeltilmesini, şartları oluşmuşsa silinmesini isteme, bu işlemlerin aktarılan kişilere bildirilmesini isteme, otomatik
        analiz sonucu aleyhinize bir sonuca itiraz etme ve kanuna aykırı işleme nedeniyle zararın giderilmesini isteme haklarına sahipsiniz.
      </p>
      <p>
        Başvurunuzu, hesabınızda kayıtlı e-posta adresinden <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine veya yazılı olarak
        {" "}{COMPANY.address} adresine iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz yanıtlanır.
      </p>

      <h2>8. Çerezler</h2>
      <p>
        Platform yalnızca oturumunuzu açık tutmak ve tercihlerinizi hatırlamak için zorunlu çerezler ve tarayıcı depolaması kullanır. Reklam veya
        izleme çerezi kullanılmaz.
      </p>

      <h2>9. Güvenlik</h2>
      <p>
        Bağlantılar şifrelidir (HTTPS). Şifreler geri döndürülemez biçimde saklanır, kart bilgileri bize ulaşmaz. Her kullanıcı yalnızca kendi
        verilerine, işletmeler yalnızca kendi randevularına erişebilir.
      </p>

      <h2>10. Değişiklikler</h2>
      <p>Bu metin güncellenebilir; güncel hali her zaman bu sayfadadır.</p>
    </LegalPage>
  );
}
