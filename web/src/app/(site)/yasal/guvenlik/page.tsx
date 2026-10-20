import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Güvenlik Açıklamaları" };

// Yalnızca sistemde gerçekten olan önlemler yazılır; yeni önlem eklenince burası da güncellenir.
export default function SecurityPage() {
  return (
    <LegalPage href="/yasal/guvenlik" title="Güvenlik açıklamaları">
      <p>
        Bu sayfa, {SITE_NAME}’da hesabınızı, randevu bilgilerinizi ve ödemelerinizi korumak için hangi önlemleri aldığımızı sade bir dille anlatır.
      </p>

      <h2>1. Şifreli bağlantı</h2>
      <p>
        Web sitesi ve mobil uygulama sunucularımızla yalnızca HTTPS (TLS) üzerinden konuşur. Tarayıcınızla sunucu arasındaki bilgiler yolda
        okunamaz ve değiştirilemez.
      </p>

      <h2>2. Hesap ve şifre güvenliği</h2>
      <ul>
        <li>Şifreniz düz metin olarak saklanmaz; kimlik doğrulama altyapısında tek yönlü olarak özetlenmiş (hash) hâliyle tutulur. Biz de dahil kimse şifrenizi göremez.</li>
        <li>Google ile girişte şifreniz Google’da kalır; bize yalnızca Google’ın paylaştığı ad ve e-posta adresi gelir.</li>
        <li>Şifre sıfırlama bağlantıları e-posta adresinize gönderilir ve kısa süre sonra geçersiz olur.</li>
      </ul>

      <h2>3. Satır düzeyinde veri güvenliği</h2>
      <p>
        Veritabanındaki her tabloda satır düzeyinde güvenlik (RLS) kuralları açıktır. Kurallar sunucu tarafında, veritabanının içinde çalışır;
        uygulamadaki bir hata bile bu sınırı aşamaz:
      </p>
      <ul>
        <li>Bir işletme yalnızca kendi randevularını, müşterilerini, personelini ve ödeme kayıtlarını görebilir.</li>
        <li>Müşteri yalnızca kendi randevularını ve bildirimlerini görebilir.</li>
        <li>
          Randevu alma, erteleme ve iptal kuralları (boş saat, çakışma, iptal süresi) veritabanında denetlenir; aynı saate iki randevu verilemez.
        </li>
        <li>
          Randevu aldığınız işletmeye son 6 aydaki iptal ve gelmeme sayılarınız gösterilir; ayrıntısı{" "}
          <Link href="/yasal/gizlilik">Gizlilik politikası</Link>’ndadır.
        </li>
      </ul>

      <h2>4. Ödeme güvenliği</h2>
      <p>
        Ödemeler, Türkiye Cumhuriyet Merkez Bankası lisanslı PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. altyapısıyla alınır. Kart bilgileri
        doğrudan PayTR’nin güvenli ödeme sayfasına girilir; {SITE_NAME} sunucularına ulaşmaz ve saklanmaz. Ödeme sonucu bize PayTR’den imzalı
        bildirimle gelir; imzası doğrulanmayan bildirim kabul edilmez.
      </p>

      <h2>5. Görseller</h2>
      <p>
        İşletmelerin yüklediği logo, kapak ve galeri görselleri yalnızca işletme sahibi tarafından yüklenebilir; dosya türü (JPG, PNG, WEBP) ve
        boyutu (en fazla 4 MB) sunucuda denetlenir. Bu görseller işletme sayfasında herkese açık gösterilmek üzere yüklenir; kişisel veri
        içeren görsel yüklememenizi rica ederiz.
      </p>

      <h2>6. Altyapı</h2>
      <p>
        {SITE_NAME}; Supabase (veritabanı ve kimlik doğrulama), Vercel (web barındırma), Cloudflare R2 (görsel depolama), Resend (e-posta) ve
        Firebase / Expo (uygulama bildirimleri) altyapılarını kullanır. Erişim anahtarları yalnızca sunucuda tutulur; tarayıcıya ve mobil
        uygulamaya gönderilmez.
      </p>

      <h2>7. Yetkili erişim</h2>
      <p>
        Platform yöneticileri, destek taleplerini çözmek, ödeme ve abonelik sorunlarını gidermek ve kötüye kullanımı önlemek için gerektiği
        ölçüde işletme ve randevu kayıtlarına erişebilir. Bu erişim yalnızca bu amaçlarla kullanılır.
      </p>

      <h2>8. Sizin yapabilecekleriniz</h2>
      <ul>
        <li>Başka sitelerde kullanmadığınız, tahmin edilmesi zor bir şifre seçin.</li>
        <li>Ortak kullanılan cihazlarda işiniz bitince çıkış yapın.</li>
        <li>{SITE_NAME} sizden e-posta, SMS veya telefonla asla şifrenizi ya da kart bilginizi istemez; böyle bir istek gelirse bize bildirin.</li>
      </ul>

      <h2>9. Güvenlik açığı bildirimi</h2>
      <p>
        Bir güvenlik açığı bulduğunuzu düşünüyorsanız lütfen herkese açık paylaşmadan önce{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine yazın. Bildiriminizi inceleyip en kısa sürede dönüş yaparız.
      </p>
    </LegalPage>
  );
}
