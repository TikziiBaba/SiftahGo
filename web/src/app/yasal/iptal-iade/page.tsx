import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "İptal ve İade Koşulları" };

export default function RefundPage() {
  return (
    <LegalPage href="/yasal/iptal-iade" title="İptal ve iade koşulları">
      <h2>1. Randevu iptali</h2>
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
        <li>{SITE_NAME}’dan kaynaklanan ve 24 saati aşan kesintilerde kesinti süresi paketinize eklenir.</li>
      </ul>

      <h2>3. Hatalı veya mükerrer çekim</h2>
      <p>
        Aynı ödeme birden fazla kez çekildiyse veya ödeme alındığı halde paket hesabınıza tanımlanmadıysa{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine ödeme numarasıyla (panelde Abonelik &gt; Ödeme geçmişi) yazın. İnceleme
        sonunda fazla çekilen tutar ödemenin yapıldığı karta iade edilir. Karta iadelerde tutarın hesabınıza yansıması
        bankanıza bağlı olarak birkaç iş günü sürebilir.
      </p>

      <h2>4. Başvuru</h2>
      <p>
        İptal ve iade talepleriniz için: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> · {COMPANY.phone}. Ayrıntılar{" "}
        <Link href="/yasal/mesafeli-satis">Mesafeli satış sözleşmesi</Link> ve <Link href="/yasal/kullanim-kosullari">Hizmet şartları</Link>{" "}
        sayfalarındadır.
      </p>
    </LegalPage>
  );
}
