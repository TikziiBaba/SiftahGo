import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/constants";

// Google'a taranacak sayfaları bildirir: sabit sayfalar + yayındaki her işletme sayfası.
// Çerez gerekmediği için oturumsuz istemci kullanılır.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.from("businesses").select("slug").eq("is_published", true);

  const pages = ["", "/kesfet", "/iletisim", "/yasal/gizlilik", "/yasal/kullanim-kosullari", "/yasal/guvenlik","/yasal/mesafeli-satis", "/yasal/iptal-iade"];
  return [
    ...pages.map((path) => ({ url: `${SITE_URL}${path}`, priority: path === "" ? 1 : 0.5 })),
    ...(data ?? []).map((b) => ({ url: `${SITE_URL}/${b.slug}`, priority: 0.8 })),
  ];
}
