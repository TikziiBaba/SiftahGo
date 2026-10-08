import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin, Search, Star, Store } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, CITIES, categoryLabel } from "@/lib/constants";
import type { Business } from "@/lib/types";

export const metadata: Metadata = {
  title: "İşletme Bul",
  description: "Size yakın berber, kuaför, güzellik salonu, oto yıkama ve daha fazlasından online randevu alın.",
};

export default function DiscoverPage({ searchParams }: PageProps<"/kesfet">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">İşletme bul, randevunu al</h1>
        <p className="mt-2 text-ink-2">Kategori ve şehir seçin, size uygun saati hemen ayırtın.</p>
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

async function Results({ searchParams }: { searchParams: PageProps<"/kesfet">["searchParams"] }) {
  const sp = await searchParams;
  const q = one(sp.q);
  const category = one(sp.kategori);
  const city = one(sp.sehir);

  const supabase = await createClient();
  let query = supabase
    .from("businesses")
    .select("id, slug, name, category, city, district, logo_url, cover_url, description, rating_avg, rating_count")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "")}%`);
  if (category) query = query.eq("category", category);
  if (city) query = query.eq("city", city);
  const { data } = await query;
  const businesses = (data ?? []) as Business[];

  return (
    <>
      <form className="card mt-6 grid gap-3 p-4 md:grid-cols-[1fr_200px_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={q} placeholder="İşletme adı ara" className="input pl-9" />
        </div>
        <select name="kategori" defaultValue={category} className="input">
          <option value="">Tüm kategoriler</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select name="sehir" defaultValue={city} className="input">
          <option value="">Tüm şehirler</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary">Ara</button>
      </form>

      {businesses.length === 0 ? (
        <div className="card mt-6 grid place-items-center p-12 text-center">
          <Store className="size-10 text-ink-4" />
          <p className="mt-3 font-medium">Aramanıza uygun işletme bulunamadı</p>
          <p className="mt-1 text-sm text-ink-3">Filtreleri değiştirmeyi deneyin.</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <li key={b.id}>
              <Link href={`/${b.slug}`} className="card block overflow-hidden transition hover:shadow-lg">
                <div className="h-32 bg-gradient-to-br from-brand-900/60 to-surface-2">
                  {b.cover_url && <img src={b.cover_url} alt="" className="size-full object-cover" />}
                </div>
                <div className="flex gap-3 p-4">
                  <div className="-mt-10 size-14 shrink-0 overflow-hidden rounded-xl border-4 border-bg bg-brand-700 shadow">
                    {b.logo_url ? (
                      <img src={b.logo_url} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-lg font-bold text-white">
                        {b.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{b.name}</p>
                    <p className="flex items-center gap-1.5 text-sm text-ink-3">
                      {categoryLabel(b.category)}
                      {b.rating_count > 0 && (
                        <span className="flex items-center gap-0.5 font-medium text-ink-2">
                          · <Star className="size-3.5 fill-amber-400 text-amber-400" /> {Number(b.rating_avg).toFixed(1)}
                        </span>
                      )}
                    </p>
                    {b.city && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-ink-3">
                        <MapPin className="size-3.5" /> {[b.district, b.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card h-52 animate-pulse bg-surface-2" />
      ))}
    </div>
  );
}
