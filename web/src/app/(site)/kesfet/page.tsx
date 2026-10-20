import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck, Check, Search, Store, X } from "lucide-react";
import { BusinessCard } from "@/components/business-card";
import { NearbyResults } from "@/components/nearby-results";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { CategoryIcon } from "@/lib/category-icons";
import { CATEGORIES, categoryLabel, CITIES } from "@/lib/constants";
import type { Business } from "@/lib/types";

export const metadata: Metadata = {
  title: "İşletme Bul",
  description: "Size yakın berber, kuaför, güzellik salonu, oto yıkama ve daha fazlasından online randevu alın.",
};

export default function DiscoverPage({ searchParams }: PageProps<"/kesfet">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 md:pt-14">
        <span className="eyebrow">
          <span className="size-1.5 rounded-full bg-gold shadow-[0_0_8px_rgb(245_181_68)]" />
          Keşfet
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] md:text-5xl">
          İşletme bul, <span className="text-gradient">randevunu al.</span>
        </h1>
        <p className="mt-3 max-w-xl text-ink-2">Kategori ve şehir seçin, size uygun saati hemen ayırtın.</p>
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

type Sort = "puan" | "yeni" | "yorum";
type Filters = { q: string; category: string; city: string; today: boolean; sort: Sort };

const SORTS: { id: Sort; label: string }[] = [
  { id: "puan", label: "En iyi puan" },
  { id: "yorum", label: "En çok yorum" },
  { id: "yeni", label: "En yeni" },
];

/** Diğer süzgeçleri koruyarak birini değiştiren Keşfet adresi */
function discoverHref(current: Filters, change: Partial<Filters>) {
  const f = { ...current, ...change };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("kategori", f.category);
  if (f.city) p.set("sehir", f.city);
  if (f.today) p.set("bugun", "1");
  if (f.sort !== "puan") p.set("sirala", f.sort);
  const s = p.toString();
  return s ? `/kesfet?${s}` : "/kesfet";
}

const chip =
  "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm ring-1 transition-colors duration-300";
const chipOff = "bg-tint/[0.04] text-ink-2 ring-line hover:bg-tint/[0.08] hover:text-ink";
const chipOn = "bg-brand-400/10 text-accent-strong ring-brand-400/40";

async function Results({ searchParams }: { searchParams: PageProps<"/kesfet">["searchParams"] }) {
  const sp = await searchParams;
  const sort = (SORTS.find((s) => s.id === one(sp.sirala))?.id ?? "puan") as Sort;
  const f: Filters = { q: one(sp.q), category: one(sp.kategori), city: one(sp.sehir), today: one(sp.bugun) === "1", sort };
  const { q, category, city, today } = f;
  const filtered = !!(q || category || city || today);

  const supabase = await createClient();
  let query = supabase
    .from("businesses")
    .select("id, slug, name, category, city, district, logo_url, cover_url, description, rating_avg, rating_count")
    .eq("is_published", true)
    .order(sort === "yeni" ? "created_at" : sort === "yorum" ? "rating_count" : "rating_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "")}%`);
  if (category) query = query.eq("category", category);
  if (city) query = query.eq("city", city);
  const { data } = await query;
  let businesses = (data ?? []) as Business[];
  // "Bugün müsait": bugün boş saati olanlar
  if (today && businesses.length) {
    const { data: open } = await supabase.rpc("available_today", { p_ids: businesses.map((b) => b.id) });
    const ids = new Set((open ?? []) as string[]);
    businesses = businesses.filter((b) => ids.has(b.id));
  }
  const summary = [category && categoryLabel(category), city, today && "bugün müsait"].filter(Boolean).join(" · ");

  return (
    <>
      {/* Arama değişince alanlar yeni değerlerle yeniden kurulur ("Temizle" sonrası eski yazı kalmasın). */}
      <Form key={`${q}|${city}`} action="/kesfet" className="bezel mt-8">
        <div className="bezel-core grid grid-cols-[1fr_auto] gap-2 p-2 sm:grid-cols-[1fr_11rem_auto]">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={q} placeholder="İşletme adı ara" aria-label="İşletme adı" className="input py-3 pl-10" />
          </div>
          <select name="sehir" defaultValue={city} aria-label="Şehir" className="input py-3">
            <option value="">Tüm şehirler</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn btn-primary px-6">Ara</button>
        </div>
        {category && <input type="hidden" name="kategori" value={category} />}
        {today && <input type="hidden" name="bugun" value="1" />}
        {sort !== "puan" && <input type="hidden" name="sirala" value={sort} />}
      </Form>

      {/* Telefonda yana kayar, genişte satıra sığmayan alta geçer. */}
      <nav aria-label="Kategoriler" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {[{ id: "", label: "Tümü" }, ...CATEGORIES].map((c) => {
          const on = category === c.id;
          return (
            <Link
              key={c.id || "tumu"}
              href={discoverHref(f, { category: c.id })}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              <CategoryIcon id={c.id} className={`size-4 ${on ? "" : "text-accent"}`} /> {c.label}
            </Link>
          );
        })}
      </nav>

      <NearbyResults
        category={category}
        query={q}
        today={today}
        actions={
          <>
            <Link href={discoverHref(f, { today: !today })} scroll={false} className={`btn ring-1 ${today ? chipOn : chipOff}`}>
              {today ? <Check className="size-4" /> : <CalendarCheck className="size-4 text-accent" />} Bugün müsait
            </Link>
            {filtered && (
              <Link href="/kesfet" scroll={false} className="btn btn-ghost">
                <X className="size-4" /> Filtreleri temizle
              </Link>
            )}
          </>
        }
      >
        {businesses.length === 0 ? (
          <div className="card mt-6 grid place-items-center p-12 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-400/10 ring-1 ring-brand-400/20">
              <Store className="size-6 text-accent" />
            </span>
            <p className="mt-4 font-medium">Aramanıza uygun işletme bulunamadı</p>
            <p className="mt-1 text-sm text-ink-3">
              {filtered ? "Filtreleri değiştirmeyi ya da temizlemeyi deneyin." : "Yakında burada yeni işletmeler olacak."}
            </p>
            {filtered && (
              <Link href="/kesfet" scroll={false} className="btn btn-secondary mt-5">
                Filtreleri temizle
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-2">
                <strong className="font-semibold text-ink">{businesses.length === 60 ? "60+" : businesses.length} işletme</strong>
                {summary && <span className="text-ink-3"> · {summary}</span>}
              </p>
              <nav aria-label="Sıralama" className="flex gap-1 rounded-full bg-surface p-1 text-sm ring-1 ring-line">
                {SORTS.map((o) => (
                  <Link
                    key={o.id}
                    href={discoverHref(f, { sort: o.id })}
                    scroll={false}
                    aria-current={sort === o.id ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 transition-colors duration-300 ${sort === o.id ? "bg-brand-400/12 font-medium text-accent" : "text-ink-3 hover:text-ink"}`}
                  >
                    {o.label}
                  </Link>
                ))}
              </nav>
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {businesses.map((b) => (
                <li key={b.id}>
                  <BusinessCard b={b} />
                </li>
              ))}
            </ul>
          </>
        )}
      </NearbyResults>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-hidden>
      <div className="bezel mt-8 h-[4.25rem] animate-pulse" />
      <div className="mt-5 flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="mt-[4.5rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card h-56 animate-pulse bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
