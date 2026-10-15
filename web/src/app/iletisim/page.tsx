import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Hakkımızda ve İletişim" };

export default function ContactPage() {
  return (
    <LegalPage href="/iletisim" title="Hakkımızda ve iletişim">
      <h2>Hakkımızda</h2>
      <p>
        {SITE_NAME}; berber, kuaför, güzellik salonu, oto yıkama, halı saha ve randevuyla çalışan tüm esnaf için online randevu ve işletme yönetimi
        platformudur. Müşteriler işletmenin bağlantısından saniyeler içinde randevu alır; işletmeler günlük takvimini, personelini, hizmetlerini ve
        müşterilerini tek yerden yönetir.
      </p>
      <p>
        Müşteriler için randevu almak ücretsizdir. İşletmeler 7 gün ücretsiz denedikten sonra aylık paketlerden birini seçer; fiyatlar{" "}
        <Link href="/esnaf#fiyatlar">Fiyatlar</Link> bölümünde yazılıdır.
      </p>

      <h2>İletişim bilgileri</h2>
      <ul>
        <li><strong>Satıcı ve platform işleticisi:</strong> {COMPANY.name}</li>
        <li><strong>Adres:</strong> {COMPANY.address}</li>
        <li><strong>Telefon:</strong> {COMPANY.phone}</li>
        <li><strong>E-posta:</strong> <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></li>
        <li><strong>Web:</strong> {SITE_DOMAIN}</li>
      </ul>
      <p>
        Soru, şikâyet, iade ve kişisel veri başvurularınızı e-postayla iletebilirsiniz. Randevuyla ilgili konularda (saat, fiyat, hizmet) önce
        randevu aldığınız işletmeyle iletişime geçmenizi öneririz; işletmenin telefonu kendi sayfasında yazılıdır.
      </p>

      <h2>Güvenli ödeme</h2>
      <p>
        Ödemeler, Türkiye Cumhuriyet Merkez Bankası lisanslı ödeme kuruluşu PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. altyapısıyla alınır. Kart
        bilgileriniz {SITE_NAME}’ya ulaşmaz ve saklanmaz.
      </p>
    </LegalPage>
  );
}
