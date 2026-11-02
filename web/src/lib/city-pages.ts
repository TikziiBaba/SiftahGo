import { cacheLife } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { BusinessCardData } from "@/components/business-card";
import { CATEGORIES, CITIES, SHOWCASE_CATEGORY_IDS } from "@/lib/constants";
import { slugify } from "@/lib/format";

// "Diğer" arama için anlamlı bir sayfa değil.
const pageCategories = CATEGORIES.filter((c) => c.id !== "diger");

export const cityBySlug = (slug: string) => CITIES.find((c) => slugify(c) === slug);
export const categoryById = (id: string) => pageCategories.find((c) => c.id === id);
export const cityHref = (city: string) => `/sehir/${slugify(city)}`;

/** Şehir ve kategorinin sayfası; sayfası olmayan değerlerde Keşfet süzgeci. */
export function categoryHref(city: string, category: string) {
  return CITIES.includes(city) && categoryById(category) ? `${cityHref(city)}/${category}` : `/kesfet?kategori=${category}`;
}

export function pageTitleSuffix(category: string) {
  return SHOWCASE_CATEGORY_IDS.includes(category) ? "Menü ve Kuponlar" : "Online Randevu";
}

export function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Herkes için aynı (yalnızca yayındaki işletmeler): şehir başına önbellekte tutulur.
export async function cityBusinesses(city: string) {
  "use cache";
  cacheLife("minutes");
  const { data } = await publicClient()
    .from("businesses")
    .select("id, slug, name, category, city, district, logo_url, cover_url, rating_avg, rating_count, business_type")
    .eq("is_published", true)
    .eq("city", city)
    .order("rating_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as BusinessCardData[];
}

/** Yayında işletmesi olan şehir ve kategori çiftleri: site haritası ve önceden hazırlanan sayfalar için. */
export async function listedPages() {
  const { data } = await publicClient().from("businesses").select("city, category").eq("is_published", true);
  const cities = new Set<string>();
  const pairs = new Map<string, { city: string; category: string }>();
  for (const b of (data ?? []) as { city: string; category: string }[]) {
    if (!CITIES.includes(b.city)) continue;
    cities.add(b.city);
    if (categoryById(b.category)) pairs.set(`${b.city}|${b.category}`, b);
  }
  return { cities: [...cities], pairs: [...pairs.values()] };
}
