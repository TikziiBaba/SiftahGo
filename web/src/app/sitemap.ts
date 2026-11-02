import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { cityHref, categoryHref, listedPages } from "@/lib/city-pages";
import { SITE_URL } from "@/lib/constants";

// Google'a taranacak sayfaları bildirir: sabit sayfalar + yayındaki her işletme sayfası.
// Çerez gerekmediği için oturumsuz istemci kullanılır.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.from("businesses").select("slug").eq("is_published", true);

  const { cities, pairs } = await listedPages();
  const pages = ["", "/esnaf", "/kesfet", "/iletisim", "/yasal/gizlilik", "/yasal/cerez-politikasi", "/yasal/kvkk-basvuru", "/yasal/kullanim-kosullari", "/yasal/guvenlik","/yasal/mesafeli-satis", "/yasal/iptal-iade"];
  return [
    // Müşteri (/) ve esnaf (/esnaf) ana sayfaları öne çıkar.
    ...pages.map((path) => ({ url: `${SITE_URL}${path}`, priority: path === "" || path === "/esnaf" ? 1 : 0.5 })),
    ...(data ?? []).map((b) => ({ url: `${SITE_URL}/${b.slug}`, priority: 0.8 })),
    // Yalnızca işletmesi olan şehir ve kategori sayfaları; boş sayfa bildirilmez.
    ...cities.map((c) => ({ url: `${SITE_URL}${cityHref(c)}`, priority: 0.7 })),
    ...pairs.map((p) => ({ url: `${SITE_URL}${categoryHref(p.city, p.category)}`, priority: 0.7 })),
  ];
}
