import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "KVKK Başvuru Formu" };

// Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ m. 5'te sayılan bilgiler.
const TEMPLATE = `Konu: KVKK kapsamında başvuru

Veri sorumlusu: ${COMPANY.name} (${SITE_NAME})

Adı soyadı:
T.C. kimlik numarası (yabancılar için uyruk ve pasaport/kimlik numarası):
Tebligata esas yerleşim yeri veya iş yeri adresi:
Bildirime esas e-posta adresi / telefon:
${SITE_NAME} hesabınızdaki e-posta adresi (varsa):

Talebim (KVKK m. 11):
[ ] Kişisel verilerimin işlenip işlenmediğini öğrenmek
[ ] İşlenmişse buna ilişkin bilgi talep etmek
[ ] İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek
[ ] Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilmek
[ ] Eksik veya yanlış işlenmişse düzeltilmesini istemek
[ ] Silinmesini veya yok edilmesini istemek
[ ] Düzeltme/silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini istemek
[ ] Otomatik sistemlerle analiz sonucu aleyhime çıkan sonuca itiraz etmek
[ ] Kanuna aykırı işleme nedeniyle zararımın giderilmesini talep etmek

Açıklama:

Yanıtın gönderilmesini istediğim yol: [ ] E-posta  [ ] Posta

Tarih:
İmza (yazılı başvurularda):`;

export default function KvkkApplicationPage() {
  const mailto = `mailto:${COMPANY.email}?subject=${encodeURIComponent("KVKK kapsamında başvuru")}&body=${encodeURIComponent(TEMPLATE)}`;
  return (
    <LegalPage href="/yasal/kvkk-basvuru" title="KVKK başvuru formu">
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu’nun 11. maddesi kapsamındaki haklarınızı kullanmak için veri sorumlusu{" "}
        <strong>{COMPANY.name}</strong>’a aşağıdaki yollardan biriyle başvurabilirsiniz.
      </p>

      <h2>1. Başvuru yolları</h2>
      <ul>
        <li>
          <strong>E-posta:</strong> {SITE_NAME} hesabınızda kayıtlı e-posta adresinden <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>{" "}
          adresine. Kimliğinizi doğrulayabilmemiz için kayıtlı adresinizi kullanmanız gerekir.
        </li>
        <li>
          <strong>Yazılı:</strong> ıslak imzalı dilekçe ile şahsen veya noter aracılığıyla {COMPANY.address} adresine.
        </li>
        <li>
          <strong>Güvenli elektronik imza, mobil imza veya KEP</strong> ile yukarıdaki e-posta adresine.
        </li>
      </ul>

      <h2>2. Başvuruda bulunması gerekenler</h2>
      <p>
        Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca başvurunuzda adınız soyadınız, T.C. kimlik numaranız (yabancılar için
        uyruk ve pasaport/kimlik numarası), tebligata esas adresiniz, bildirime esas e-posta veya telefonunuz ve talep konunuz yer almalıdır.
        Yazılı başvurular imzalı olmalıdır. Başkası adına yapılan başvurularda vekâletname eklenmelidir.
      </p>

      <h2>3. Başvuru şablonu</h2>
      <p>Aşağıdaki metni kopyalayıp doldurabilir veya e-posta uygulamanızda hazır açabilirsiniz.</p>
      <pre className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 font-mono text-xs leading-relaxed text-ink-2 ring-1 ring-line">{TEMPLATE}</pre>
      <p>
        <a href={mailto} className="btn btn-primary text-brand-950 no-underline hover:no-underline">
          E-posta ile başvur
        </a>
      </p>

      <h2>4. Yanıt süresi</h2>
      <p>
        Başvurunuz, talebin niteliğine göre en kısa sürede ve en geç <strong>30 gün</strong> içinde ücretsiz olarak sonuçlandırılır. İşlemin ayrıca
        bir maliyet gerektirmesi halinde Kişisel Verileri Koruma Kurulu’nca belirlenen tarifedeki ücret alınabilir.
      </p>
      <p>
        Başvurunuz reddedilirse, verilen cevabı yetersiz bulursanız veya süresinde cevap verilmezse; cevabı öğrendiğiniz tarihten itibaren 30 gün
        ve her halde başvuru tarihinden itibaren 60 gün içinde Kişisel Verileri Koruma Kurulu’na şikâyette bulunabilirsiniz.
      </p>

      <h2>5. Hesabınızı kendiniz silebilirsiniz</h2>
      <p>
        Müşteri hesabınızı <Link href="/hesabim?sekme=profil">Hesabım › Profil</Link> sayfasındaki “Hesabımı sil” ile hemen silebilirsiniz.
        Yaklaşan randevularınız iptal edilir, yorumlarınızdaki adınız kaldırılır; işletmelerin randevu defterlerindeki geçmiş randevu kayıtları
        hesabınızla bağlantısı kesilerek kalır. İşletme hesapları için yukarıdaki yollardan başvurun.
      </p>
    </LegalPage>
  );
}
