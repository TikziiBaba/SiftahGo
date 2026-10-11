import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Hizmet Şartları" };

export default function TermsPage() {
  return (
    <LegalPage href="/yasal/kullanim-kosullari" title="Hizmet şartları ve üyelik sözleşmesi">
      <p>
        Bu koşullar, {SITE_DOMAIN} adresindeki web sitesi ve {SITE_NAME} mobil uygulamasının (birlikte “Platform”) kullanımını düzenler.
        Platform’u <strong>{COMPANY.name}</strong> (“{SITE_NAME}”) işletir. Hesap açan veya randevu alan herkes bu koşulları kabul etmiş sayılır.
      </p>

      <h2>1. Tanımlar</h2>
      <ul>
        <li><strong>Müşteri:</strong> Platform üzerinden randevu alan kişi (hesaplı veya misafir).</li>
        <li><strong>İşletme:</strong> Platform’da sayfası olan ve randevu kabul eden esnaf, firma veya serbest meslek sahibi.</li>
        <li><strong>Randevu:</strong> Müşteri ile İşletme arasında, belirli bir gün ve saatte verilecek hizmet için yapılan kayıt.</li>
      </ul>

      <h2>2. {SITE_NAME}’nun rolü</h2>
      <p>
        {SITE_NAME}, Müşteri ile İşletme’yi buluşturan bir randevu ve işletme yönetimi platformudur. Randevu alınan hizmeti İşletme verir;
        hizmetin içeriği, fiyatı, kalitesi ve zamanında verilmesinden İşletme sorumludur. {SITE_NAME}, 6563 sayılı Elektronik Ticaretin
        Düzenlenmesi Hakkında Kanun kapsamında <strong>aracı hizmet sağlayıcıdır</strong>; İşletme’nin sayfasına yazdığı bilgilerin doğruluğunu
        önceden denetlemekle yükümlü değildir, hukuka aykırı içerikten haberdar olduğunda kaldırır.
      </p>

      <h2>3. Hesap</h2>
      <ul>
        <li>Hesap açarken doğru ve güncel bilgi verirsiniz. Şifrenizin gizliliğinden siz sorumlusunuz.</li>
        <li>Hesap açmak için 18 yaşını doldurmuş olmalısınız. 18 yaşından küçükler randevuyu veli veya vasisi aracılığıyla alır.</li>
        <li>Hesabınızın silinmesini <Link href="/iletisim">iletişim</Link> sayfasındaki e-posta adresinden istediğiniz zaman isteyebilirsiniz.</li>
      </ul>

      <h2>4. Müşterinin yükümlülükleri</h2>
      <ul>
        <li>Yalnızca gerçekten gideceğiniz randevuları alırsınız. Başkası adına bilgi girmek, sahte veya toplu randevu almak yasaktır.</li>
        <li>Gelemeyecekseniz randevuyu “Randevularım” sayfasından veya İşletme’ye haber vererek iptal edersiniz.</li>
        <li>
          Randevu düzenini korumak için son 6 aydaki iptal ve gelmeme sayınız, randevu aldığınız İşletmelere gösterilir. Sık iptal veya gelmeme
          durumunda İşletme randevunuzu onaylamadan önce inceleyebilir. Ayrıntılar <Link href="/yasal/gizlilik">Gizlilik ve KVKK</Link> metnindedir.
        </li>
        <li>Değerlendirmeleriniz gerçek deneyiminizi yansıtmalı; hakaret, kişisel veri veya reklam içeremez.</li>
      </ul>

      <h2>5. İşletmenin yükümlülükleri</h2>
      <ul>
        <li>İşletme bilgilerini, hizmetleri, fiyatları ve çalışma saatlerini doğru ve güncel tutar; faaliyeti için gereken izin ve belgelere sahiptir.</li>
        <li>Yüklediği logo, fotoğraf ve metinlerin kullanım hakkına sahiptir; bunlar üçüncü kişilerin haklarını ihlal edemez.</li>
        <li>Onayladığı randevulara uyar; veremeyeceği randevuyu en kısa sürede iptal eder ve Müşteri’yi bilgilendirir.</li>
        <li>
          Platform’da gördüğü müşteri bilgilerini yalnızca randevu ve hizmet için kullanır; izinsiz reklam mesajı göndermez, bilgileri üçüncü kişilerle
          paylaşmaz. Kendi müşterilerinin verileri bakımından İşletme de 6698 sayılı Kanun kapsamında ayrı veri sorumlusudur.
        </li>
        <li>Müşterilerine karşı vergi, fatura ve tüketici mevzuatından doğan yükümlülükleri kendisine aittir.</li>
      </ul>

      <h2>6. Paketler, ücretsiz deneme ve bakiye</h2>
      <ul>
        <li>Müşteriler için randevu almak ücretsizdir. İşletme sayfasının yayında kalması için İşletme bir paket kullanır.</li>
        <li>Yeni işletmeler 7 gün boyunca Pro paketi ücretsiz kullanır. Deneme sonunda paket alınmazsa sayfa yayından kalkar; bilgiler silinmez.</li>
        <li>Paketler aylıktır, her ödeme 30 gün geçerlidir ve kalan süreye eklenir. Otomatik yenileme ve taahhüt yoktur.</li>
        <li>
          İşletme hesabına bakiye yükleyebilir ve paketleri bakiyeden alabilir. Bakiye yalnızca {SITE_NAME} hizmetlerinde kullanılır; nakit olarak geri
          çekilemez, başkasına devredilemez ve faiz işlemez.
        </li>
        <li>
          Satış ve iade koşulları <Link href="/yasal/mesafeli-satis">Mesafeli satış sözleşmesi</Link> ve <Link href="/yasal/iptal-iade">İptal ve iade</Link> sayfalarındadır.
        </li>
      </ul>

      <h2>7. Online ödemeli randevular</h2>
      <p>Bu bölüm, İşletme’nin randevu sırasında Müşteri’den kartla ödeme almayı açtığı durumlarda uygulanır.</p>
      <ul>
        <li>
          Randevu hizmetinin satıcısı İşletme’dir. Ödeme, lisanslı ödeme kuruluşu PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. altyapısıyla alınır ve
          PayTR tarafından İşletme’nin doğrulanmış banka hesabına aktarılır. Kart bilgileri {SITE_NAME}’ya ulaşmaz.
        </li>
        <li>Online ödeme almak için İşletme’nin PayTR’nin istediği kimlik ve banka hesabı doğrulamasını tamamlaması gerekir.</li>
        <li>{SITE_NAME}, her başarılı ödemenin <strong>%8’i</strong> oranında hizmet bedeli alır; bu tutar İşletme’ye aktarılacak tutardan düşülür.</li>
        <li>
          İade edilen ödemelerde ödeme kuruluşunun geri vermediği işlem ücretleri İşletme’ye aktarılacak tutardan düşülebilir. Müşteriye iade
          kuralları <Link href="/yasal/iptal-iade">İptal ve iade</Link> sayfasındadır.
        </li>
      </ul>

      <h2>8. İçerik ve değerlendirmeler</h2>
      <p>
        {SITE_NAME}; hukuka, bu koşullara veya genel ahlaka aykırı sayfa, görsel ve yorumları kaldırabilir. Gerçek bir randevuya dayanan
        değerlendirmeler İşletme’nin isteğiyle silinmez; İşletme değerlendirmeye cevap yazabilir.
      </p>

      <h2>9. Askıya alma ve fesih</h2>
      <p>
        Bu koşullara aykırı davranan, sahte randevu oluşturan, Platform’un çalışmasını bozmaya çalışan veya başkalarının haklarını ihlal eden
        hesaplar uyarılmadan askıya alınabilir veya kapatılabilir. Askıdaki İşletme’nin bakiyesi korunur. Kullanıcı hesabını dilediği zaman kapatabilir.
      </p>

      <h2>10. Sorumluluk</h2>
      <p>
        {SITE_NAME}, Platform’un kesintisiz ve hatasız çalışması için makul özeni gösterir; ancak bakım, altyapı sağlayıcılarından kaynaklanan arızalar
        veya mücbir sebeplerle oluşan kesintilerden doğan dolaylı zararlardan sorumlu değildir. İşletme ile Müşteri arasındaki hizmetten doğan
        uyuşmazlıklarda taraflar birbirine karşı sorumludur. Kanunen sınırlandırılamayan sorumluluklar saklıdır.
      </p>

      <h2>11. Fikri haklar</h2>
      <p>
        Platform’un yazılımı, tasarımı ve {SITE_NAME} markası Platform işleticisine ({COMPANY.name}) aittir. İşletmeler yükledikleri içeriğin sahibi olarak kalır ve bu içeriğin
        Platform’da ve tanıtımında gösterilmesine izin verir.
      </p>

      <h2>12. Değişiklikler</h2>
      <p>
        Bu koşullar güncellenebilir. Güncel metin bu sayfada yayımlanır; önemli değişiklikler hesaplı kullanıcılara e-posta veya uygulama bildirimiyle
        duyurulur. Değişiklikten sonra Platform’u kullanmaya devam etmek, yeni koşulların kabulü anlamına gelir.
      </p>

      <h2>13. Uygulanacak hukuk ve uyuşmazlıklar</h2>
      <p>
        Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Tüketici sıfatıyla yapılan başvurularda, parasal sınırlar içinde yerleşim yerinizdeki
        Tüketici Hakem Heyeti, sınırı aşan uyuşmazlıklarda Tüketici Mahkemeleri yetkilidir. Diğer uyuşmazlıklarda Platform işleticisinin yerleşim yeri
        mahkemeleri ve icra daireleri yetkilidir.
      </p>

      <h2>14. İletişim</h2>
      <p>
        {COMPANY.name} · {COMPANY.address} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> · {COMPANY.phone}
      </p>
    </LegalPage>
  );
}
