import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "İptal ve İade Koşulları" };

export default function RefundPage() {
  return (
    <LegalPage href="/yasal/iptal-iade" title="İptal ve iade koşulları">
      <h2>1. Randevu iptali (ücretsiz randevular)</h2>
      <ul>
        <li>
          Hesabıyla randevu alan müşteriler randevularını “Randevularım” sayfasından ücretsiz iptal edebilir veya saatini değiştirebilir. Misafir
          olarak randevu alanlar iptal için işletmeye haber verir.
        </li>
        <li>İşletme randevuyu iptal ederse veya saatini değiştirirse müşteriye e-posta ve uygulama bildirimiyle haber verilir.</li>
        <li>Sık yapılan iptaller ve gelinmeyen randevular, <Link href="/yasal/gizlilik">Gizlilik ve KVKK</Link> metninde açıklandığı şekilde işletmelere gösterilir.</li>
      </ul>

      <h2>2. Paketler</h2>
      <ul>
        <li>Paketler otomatik yenilenmez; devam etmek istemiyorsanız yeni ödeme yapmamanız yeterlidir. İptal için ayrıca bir işlem gerekmez.</li>
        <li>
          Paket, ödemenin onaylanmasıyla hemen başlar ve elektronik ortamda anında ifa edilir. Bu nedenle ödeme sonrasında paket bedeli
          <strong> nakit olarak iade edilmez</strong>. Satın almadan önce 7 gün ücretsiz deneme ile tüm Pro özelliklerini deneyebilirsiniz.
        </li>
        <li>
          Başka pakete geçtiğinizde yeni paket hemen başlar ve 30 gün kalan sürenizin üzerine eklenir; kalan süreniz de yeni paketle devam eder.
          Daha küçük pakete geçerseniz paket sınırını aşan personel pasif olur.
        </li>
        <li>{SITE_NAME}’dan kaynaklanan ve 24 saati aşan kesintilerde kesinti süresi paketinize eklenir veya karşılığı bakiyenize yüklenir.</li>
      </ul>

      <h2>3. Bakiye</h2>
      <ul>
        <li>Yüklenen bakiye anında hesabınıza eklenir ve yalnızca {SITE_NAME} paketlerini almak için kullanılır.</li>
        <li>Bakiye <strong>nakit olarak geri çekilemez ve iade edilmez</strong>; başka hesaba devredilemez.</li>
        <li>Size yapılması gereken iadeler ve telafiler (ör. hizmet kesintisi) nakit yerine bakiyenize eklenir.</li>
        <li>{SITE_NAME}’nun Platform’u tamamen kapatması halinde kullanılmamış bakiye iade edilir.</li>
      </ul>

      <h2>4. Hatalı veya mükerrer çekim</h2>
      <p>
        Aynı ödeme birden fazla kez çekildiyse veya ödeme alındığı halde paket ya da bakiye hesabınıza tanımlanmadıysa{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine ödeme numarasıyla (panelde Abonelik &gt; Ödeme geçmişi) yazın. İnceleme
        sonunda fazla çekilen tutar, isteğinize göre karta iade edilir veya bakiyenize eklenir. Karta iadelerde tutarın hesabınıza yansıması
        bankanıza bağlı olarak birkaç iş günü sürebilir.
      </p>

      <h2>5. Online ödemeli randevular</h2>
      <p>Bu bölüm, işletmenin randevu sırasında kartla ödeme aldığı randevular için geçerlidir. Hizmetin satıcısı işletmedir.</p>
      <ul>
        <li>İşletme randevuyu iptal ederse veya hizmeti veremezse ödenen tutarın tamamı karta iade edilir.</li>
        <li>Müşteri randevu saatinden önce “Randevularım” sayfasından iptal ederse ödenen tutarın tamamı karta iade edilir.</li>
        <li>
          Randevu saati geçtikten sonra yapılan iptallerde ve randevuya gelinmediğinde iade, işletmenin ödeme ekranında gösterilen iptal kuralına
          göre yapılır.
        </li>
        <li>İadeler ödemenin yapıldığı karta, PayTR aracılığıyla yapılır; tutarın karta yansıması bankaya bağlı olarak birkaç iş günü sürebilir.</li>
        <li>Hizmetle ilgili şikâyetler önce işletmeye iletilir; çözülemezse {SITE_NAME} aracılık eder.</li>
      </ul>

      <h2>6. Başvuru</h2>
      <p>
        İptal ve iade talepleriniz için: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> · {COMPANY.phone}. Ayrıntılar{" "}
        <Link href="/yasal/mesafeli-satis">Mesafeli satış sözleşmesi</Link> ve <Link href="/yasal/kullanim-kosullari">Kullanım koşulları</Link>{" "}
        sayfalarındadır.
      </p>
    </LegalPage>
  );
}
