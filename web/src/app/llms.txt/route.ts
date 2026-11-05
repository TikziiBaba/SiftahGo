import { cacheLife } from "next/cache";
import { categoryById, categoryHref, cityHref, listedPages } from "@/lib/city-pages";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

// Yapay zekâ asistanları (ChatGPT, Perplexity, Gemini, Claude) için sitenin özeti: https://llmstxt.org
export async function GET() {
  return new Response(await body(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function body() {
  "use cache";
  cacheLife("hours");
  const { cities, pairs } = await listedPages();
  const cityLines = cities
    .sort((a, b) => a.localeCompare(b, "tr"))
    .flatMap((city) => [
      `- [${city} işletmeleri](${SITE_URL}${cityHref(city)})`,
      ...pairs
        .filter((p) => p.city === city)
        .map((p) => `  - [${city} ${categoryById(p.category)!.label}](${SITE_URL}${categoryHref(city, p.category)})`),
    ]);

  return `# ${SITE_NAME}

> ${SITE_NAME}, Türkiye'de berber, kuaför, güzellik salonu, tırnak ve kirpik, spa, oto yıkama, halı saha, veteriner, klinik ve diğer esnaf için online randevu sistemidir. Müşteriler boş saatleri görüp ücretsiz online randevu alır; esnaf 7/24 randevu, çakışmasız takvim, otomatik hatırlatma, müşteri defteri ve ciro raporlarını tek yerden yönetir.

- Müşteriler için randevu almak ücretsizdir; uygulama indirmek gerekmez, tarayıcıdan alınır. Android uygulaması da vardır.
- Esnaf için ilk 2 ay ücretsizdir; taahhüt ve otomatik yenileme yoktur. Paketler aylık veya yıllık alınır, ödeme PayTR ile kartla yapılır.
- Her işletmenin kendi sayfası vardır (${SITE_URL}/isletme-adi): hizmetler, fiyatlar, personel, çalışma saatleri, yorumlar ve online randevu.
- Randevusuz işletmeler (lokanta, kafe, fırın, market, mağaza) için menü ve kuponlu Vitrin sayfası vardır.
- Müşteriye randevudan 1 gün ve 2 saat önce e-posta ve uygulama bildirimiyle hatırlatma gider.

## Ana sayfalar

- [Online randevu al](${SITE_URL}/): berber, kuaför ve esnaftan boş saatleri görüp randevu alma
- [İşletme bul](${SITE_URL}/kesfet): şehir, kategori ve konuma göre işletme arama
- [Esnaf için randevu sistemi](${SITE_URL}/esnaf): özellikler, paketler ve fiyatlar, sık sorulan sorular
- [İletişim](${SITE_URL}/iletisim)

## Şehir ve kategori sayfaları

${cityLines.join("\n") || "- Henüz şehir sayfası yok."}

## Yasal

- [Kullanım koşulları](${SITE_URL}/yasal/kullanim-kosullari)
- [Gizlilik politikası](${SITE_URL}/yasal/gizlilik)
- [İptal ve iade](${SITE_URL}/yasal/iptal-iade)

## İsteğe bağlı

- [Site haritası](${SITE_URL}/sitemap.xml): yayındaki tüm işletme sayfaları
`;
}
