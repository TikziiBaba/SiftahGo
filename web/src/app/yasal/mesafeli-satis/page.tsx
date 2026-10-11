import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Mesafeli Satış Sözleşmesi" };

export default function DistanceSalesPage() {
  return (
    <LegalPage href="/yasal/mesafeli-satis" title="Ön bilgilendirme formu ve mesafeli satış sözleşmesi">
      <p>
        Bu metin, işletmelerin {SITE_NAME} paketlerini ve bakiye yüklemelerini {SITE_DOMAIN} üzerinden satın almasına uygulanır. Ödeme ekranındaki
        onay kutusu işaretlenip ödeme tamamlandığında sözleşme elektronik ortamda kurulmuş olur.
      </p>

      <h2>A. Ön bilgilendirme formu</h2>
      <h3>1. Satıcı</h3>
      <ul>
        <li>Ad soyad: {COMPANY.name}</li>
        <li>Adres: {COMPANY.address}</li>
        <li>Telefon: {COMPANY.phone}</li>
        <li>E-posta: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></li>
        <li>Web: {SITE_DOMAIN}</li>
      </ul>
      <h3>2. Alıcı</h3>
      <p>{SITE_NAME}’da işletme hesabı açan ve ödeme yapan kişidir. Alıcı bilgileri, hesap ve ödeme sırasında beyan edilen bilgilerdir.</p>
      <h3>3. Hizmetin temel nitelikleri</h3>
      <ul>
        <li>
          <strong>Paket:</strong> İşletme sayfasının yayında kalması, online randevu alınması ve paket içeriğindeki özelliklerin (personel sayısı,
          müşteri defteri, raporlar, sayfa özelleştirme vb.) 30 gün boyunca kullanılması. Paket içerikleri ve fiyatları{" "}
          <Link href="/#fiyatlar">Fiyatlar</Link> bölümünde ve panelin Abonelik sayfasında yazılıdır.
        </li>
        <li>
          <strong>Bakiye:</strong> İşletme hesabına yüklenen ve yalnızca {SITE_NAME} paketlerini almak için kullanılan ön ödeme. Tek seferde en az 50 TL,
          en fazla 10.000 TL yüklenebilir.
        </li>
      </ul>
      <h3>4. Fiyat ve ödeme</h3>
      <ul>
        <li>Ödeme ekranında gösterilen tutar ödenecek toplam bedeldir; ek ücret alınmaz.</li>
        <li>
          Ödeme banka veya kredi kartıyla, tek çekim olarak, PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. altyapısıyla alınır. Kart bilgileri
          {" "}{SITE_NAME}’ya ulaşmaz ve saklanmaz.
        </li>
        <li>Bakiyeden yapılan paket alımlarında karttan yeni bir çekim yapılmaz; paket bedeli bakiyeden düşülür.</li>
      </ul>
      <h3>5. İfa</h3>
      <p>
        Hizmet, ödemenin onaylanmasıyla <strong>anında</strong> başlar: paket hesaba tanımlanır veya bakiye hesaba eklenir. Fiziksel teslimat yoktur.
        Paket süresi, varsa kalan sürenin üzerine 30 gün olarak eklenir. Otomatik yenileme yapılmaz.
      </p>
      <h3>6. Cayma hakkı</h3>
      <p>
        Paket ve bakiye, işletmelerin ticari veya mesleki faaliyetleri için satın alınır; bu nedenle Alıcı 6502 sayılı Tüketicinin Korunması Hakkında
        Kanun anlamında tüketici sayılmaz ve cayma hakkı doğmaz. Alıcının tüketici sayıldığı durumlarda da hizmet elektronik ortamda anında ifa
        edildiği ve Alıcının onayıyla ifasına başlandığı için, Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesinin birinci fıkrasının (ğ) ve (h)
        bentleri uyarınca <strong>cayma hakkı kullanılamaz</strong>. Yeni işletmelere ödeme öncesinde 7 günlük ücretsiz deneme sunulur.
      </p>
      <h3>7. Şikâyet ve itiraz</h3>
      <p>
        Şikâyetlerinizi <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine iletebilirsiniz. Tüketici sıfatıyla, parasal sınırlar içinde
        Tüketici Hakem Heyetlerine, sınırı aşan durumlarda Tüketici Mahkemelerine başvurabilirsiniz.
      </p>

      <h2>B. Mesafeli satış sözleşmesi</h2>
      <h3>Madde 1 · Taraflar</h3>
      <p>
        Bu sözleşme, yukarıda bilgileri yazılı Satıcı ({COMPANY.name}) ile ödeme ekranında bu sözleşmeyi onaylayan Alıcı arasında, 6502 sayılı Kanun,
        Mesafeli Sözleşmeler Yönetmeliği ve 6098 sayılı Türk Borçlar Kanunu hükümlerine göre kurulmuştur.
      </p>
      <h3>Madde 2 · Konu</h3>
      <p>
        Sözleşmenin konusu, Alıcının {SITE_DOMAIN} üzerinden elektronik ortamda satın aldığı {SITE_NAME} paket aboneliği veya bakiye yüklemesinin
        satışı ve ifasına ilişkin hak ve yükümlülüklerin belirlenmesidir. Hizmetin adı, süresi ve bedeli ödeme ekranında ve Alıcının panelindeki
        ödeme geçmişinde yazılıdır.
      </p>
      <h3>Madde 3 · Bedel ve ödeme</h3>
      <p>
        Alıcı, ödeme ekranında gösterilen toplam bedeli kartla veya bakiyesinden öder. Ödeme kuruluşunun onay vermediği işlemlerde hizmet başlamaz
        ve karttan çekim yapılmaz.
      </p>
      <h3>Madde 4 · İfa</h3>
      <p>
        Satıcı, ödemenin onaylanmasıyla hizmeti derhal sunar. Paket 30 gün süreyle geçerlidir; bu süre içinde Platform’un çalışması için makul özen
        gösterilir. Satıcıdan kaynaklanan ve 24 saati aşan kesintilerde kesinti süresi pakete eklenir veya karşılığı bakiyeye yüklenir.
      </p>
      <h3>Madde 5 · Bakiye</h3>
      <ul>
        <li>Bakiye yalnızca {SITE_NAME} paketlerini almak için kullanılır; nakit olarak geri çekilemez, başka hesaba devredilemez ve faiz işlemez.</li>
        <li>Alıcının kendi isteğiyle hesabını kapatması halinde kullanılmamış bakiye iade edilmez.</li>
        <li>Satıcının Platform’u tamamen kapatması halinde kullanılmamış bakiye, ödemenin yapıldığı karta veya Alıcının bildireceği hesaba iade edilir.</li>
        <li>Hesabın askıya alınması bakiyeyi ortadan kaldırmaz; askı kalkınca bakiye kullanılabilir.</li>
      </ul>
      <h3>Madde 6 · Cayma ve iade</h3>
      <p>
        Cayma hakkı, ön bilgilendirme formunun 6. maddesinde açıklanan nedenlerle kullanılamaz. İade koşulları{" "}
        <Link href="/yasal/iptal-iade">İptal ve iade</Link> sayfasında yazılıdır ve bu sözleşmenin parçasıdır.
      </p>
      <h3>Madde 7 · Alıcının yükümlülükleri</h3>
      <p>
        Alıcı, ödeme sırasında verdiği bilgilerin doğru olduğunu ve kullandığı kartın kendisine ait olduğunu veya kart sahibinin onayıyla
        kullandığını kabul eder. Kartın yetkisiz kullanımı nedeniyle bankanın ödemeyi geri alması halinde ilgili paket veya bakiye geri alınır.
      </p>
      <h3>Madde 8 · Uyuşmazlıklar</h3>
      <p>
        Bu sözleşmeden doğan uyuşmazlıklarda, tüketici sıfatıyla yapılan başvurularda Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri, diğer
        durumlarda Satıcının yerleşim yeri mahkemeleri ve icra daireleri yetkilidir.
      </p>
      <h3>Madde 9 · Yürürlük</h3>
      <p>
        Alıcı, ödeme ekranında “Ön bilgilendirme formunu ve mesafeli satış sözleşmesini okudum, onaylıyorum” kutusunu işaretleyerek bu metnin tüm
        koşullarını kabul etmiş sayılır. Sözleşme, ödemenin onaylandığı anda yürürlüğe girer. Sözleşmenin güncel hali her zaman bu sayfadadır.
      </p>

      <h2>C. Online ödemeli randevular</h2>
      <p>
        İşletmenin randevu sırasında kartla ödeme aldığı durumlarda hizmetin satıcısı <strong>işletmedir</strong>; sözleşme müşteri ile işletme
        arasında kurulur. {SITE_NAME} bu satışta 6563 sayılı Kanun kapsamında aracı hizmet sağlayıcıdır. İşletmenin bilgileri, hizmetin
        bedeli ve iptal kuralı ödeme ekranında gösterilir; ödeme PayTR altyapısıyla alınır. İade koşulları{" "}
        <Link href="/yasal/iptal-iade">İptal ve iade</Link> sayfasındadır.
      </p>
    </LegalPage>
  );
}
