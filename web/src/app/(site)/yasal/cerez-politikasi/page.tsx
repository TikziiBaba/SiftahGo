import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { LegalPage } from "@/components/legal-page";
import { COMPANY } from "@/lib/company";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Çerez Politikası" };

// Sitede gerçekten kullanılan çerez ve tarayıcı depolaması kayıtları. Yeni bir çerez eklenince bu tablo güncellenmeli.
const COOKIES = [
  {
    name: "sb-…-auth-token",
    kind: "Çerez · Zorunlu",
    purpose: "Giriş oturumunuzu açık tutar. Uzun oturumlarda “.0”, “.1” gibi parçalara bölünebilir.",
    duration: "Çıkış yapana kadar (en fazla 400 gün)",
    owner: `${SITE_NAME} (Supabase altyapısı)`,
  },
  {
    name: "sb-…-auth-token-code-verifier",
    kind: "Çerez · Zorunlu",
    purpose: "Google ile girişte ve e-posta doğrulamasında isteğin sizden geldiğini doğrular.",
    duration: "Giriş tamamlanınca silinir",
    owner: `${SITE_NAME} (Supabase altyapısı)`,
  },
  {
    name: "sg_cerez",
    kind: "Çerez · Zorunlu",
    purpose: "Bu sayfadaki çerez tercihinizi hatırlar; bant her ziyarette yeniden çıkmaz.",
    duration: "180 gün",
    owner: SITE_NAME,
  },
  {
    name: "Cloudflare Turnstile",
    kind: "Çerez/depolama · Zorunlu (güvenlik)",
    purpose: "Giriş ve kayıt formlarında isteğin bir robottan gelmediğini doğrular. Yalnızca bu formlarda yüklenir.",
    duration: "Kısa süreli (oturum)",
    owner: "Cloudflare, Inc.",
  },
  {
    name: "siftahgo.davet",
    kind: "Tarayıcı depolaması · Zorunlu",
    purpose: "Davet bağlantısıyla gelen işletme sahibinin davet kodunu, işletme kurulumunda doldurmak için tutar.",
    duration: "Kurulum tamamlanınca silinir",
    owner: SITE_NAME,
  },
  {
    name: "siftahgo.son-bakilan",
    kind: "Tarayıcı depolaması · İşlevsel (onaya bağlı)",
    purpose: "Ana sayfada “Son baktıkların” bölümü için son baktığınız en fazla 8 işletmeyi bu cihazda tutar. Sunucuya gönderilmez.",
    duration: "Onayınızı geri çekince silinir",
    owner: SITE_NAME,
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage href="/yasal/cerez-politikasi" title="Çerez politikası">
      <p>
        Bu politika, {SITE_DOMAIN} web sitesinde hangi çerezlerin ve benzeri tarayıcı depolama teknolojilerinin kullanıldığını, neden
        kullanıldığını ve tercihlerinizi nasıl yönetebileceğinizi açıklar. Kişisel verilerinizin işlenmesine ilişkin ayrıntılar{" "}
        <Link href="/yasal/gizlilik">Gizlilik politikası ve KVKK aydınlatma metninde</Link> yer alır.
      </p>

      <h2>1. Çerez nedir?</h2>
      <p>
        Çerezler, ziyaret ettiğiniz sitenin tarayıcınıza kaydettiği küçük metin dosyalarıdır. Tarayıcı depolaması (localStorage) da benzer şekilde
        bilgiyi yalnızca sizin cihazınızda tutar. Bu politikada ikisine birlikte “çerez” diyoruz.
      </p>

      <h2>2. Kullandığımız çerezler</h2>
      <p>
        <strong>Reklam, izleme, analitik veya sosyal medya çerezi kullanmıyoruz.</strong> Kullandıklarımız iki türdür:
      </p>
      <ul>
        <li>
          <strong>Zorunlu çerezler:</strong> giriş yapmak, randevu almak ve sitenin güvenli çalışması için gereklidir; kapatılamaz. Bunları
          tarayıcınızdan engellerseniz giriş yapamaz ve randevu alamazsınız.
        </li>
        <li>
          <strong>İşlevsel depolama:</strong> deneyiminizi kolaylaştırır (son baktığınız işletmeler). Yalnızca onay verirseniz kullanılır.
        </li>
      </ul>

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 overflow-hidden rounded-2xl text-left text-sm ring-1 ring-line">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Ad</th>
              <th className="px-4 py-3 font-medium">Tür</th>
              <th className="px-4 py-3 font-medium">Amaç</th>
              <th className="px-4 py-3 font-medium">Süre</th>
              <th className="px-4 py-3 font-medium">Sağlayan</th>
            </tr>
          </thead>
          <tbody className="bg-surface">
            {COOKIES.map((c) => (
              <tr key={c.name} className="align-top">
                <td className="border-t border-line px-4 py-3 font-mono text-xs text-ink">{c.name}</td>
                <td className="border-t border-line px-4 py-3 text-ink-2">{c.kind}</td>
                <td className="border-t border-line px-4 py-3 text-ink-2">{c.purpose}</td>
                <td className="border-t border-line px-4 py-3 text-ink-2">{c.duration}</td>
                <td className="border-t border-line px-4 py-3 text-ink-2">{c.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>3. Hukuki sebep</h2>
      <ul>
        <li>
          Zorunlu çerezler, talep ettiğiniz hizmetin sunulması ve platform güvenliği için kullanılır.{" "}
          <em>Hukuki sebep: sözleşmenin kurulması ve ifası ile meşru menfaat (KVKK m. 5/2-c, f).</em>
        </li>
        <li>
          İşlevsel depolama yalnızca açık rızanızla kullanılır. <em>Hukuki sebep: açık rıza (KVKK m. 5/1).</em> Rızanızı istediğiniz zaman geri
          alabilirsiniz; geri aldığınızda kayıtlı veriler cihazınızdan silinir.
        </li>
      </ul>

      <h2>4. Tercihlerinizi nasıl yönetirsiniz?</h2>
      <p>
        Siteye ilk girdiğinizde çıkan bantta “Tümünü kabul et”, “Yalnızca zorunlu” veya “Tercihleri yönet” seçeneklerinden birini seçersiniz.
        Seçiminizi istediğiniz zaman değiştirebilirsiniz:
      </p>
      <p>
        <CookieSettingsButton className="btn btn-secondary" label="Çerez tercihlerimi değiştir" />
      </p>
      <p>
        Tarayıcınızın ayarlarından da çerezleri silebilir veya engelleyebilirsiniz. Bu durumda zorunlu çerezler de silineceği için oturumunuz
        kapanır.
      </p>

      <h2>5. Mobil uygulama</h2>
      <p>
        {SITE_NAME} mobil uygulaması çerez kullanmaz. Giriş oturumu ve bildirim izni bilgileri yalnızca cihazınızın uygulama depolamasında tutulur.
      </p>

      <h2>6. İletişim</h2>
      <p>
        Sorularınız için <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine yazabilirsiniz. Haklarınızı kullanmak için{" "}
        <Link href="/yasal/kvkk-basvuru">KVKK başvuru formunu</Link> inceleyin.
      </p>
    </LegalPage>
  );
}
