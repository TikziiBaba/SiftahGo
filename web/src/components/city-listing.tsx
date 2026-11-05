import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { BusinessCard } from "@/components/business-card";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { CategoryIcon } from "@/lib/category-icons";
import { categoryHref, cityBusinesses, cityHref } from "@/lib/city-pages";
import { CATEGORIES, categoryLabel, SITE_URL } from "@/lib/constants";

/** /sehir/[sehir] ve /sehir/[sehir]/[kategori]: aramadan gelen ziyaretçi için işletme listesi. */
export async function CityListing({ city, category }: { city: string; category?: string }) {
  const all = await cityBusinesses(city);
  const businesses = category ? all.filter((b) => b.category === category) : all;
  const present = CATEGORIES.filter((c) => c.id !== "diger" && all.some((b) => b.category === c.id));
  const label = category ? categoryLabel(category) : "";

  // Arama motorları ve yapay zekâ asistanları için: gezinti yolu ve sayfadaki işletme listesi.
  const crumbs = [
    { name: "Keşfet", url: `${SITE_URL}/kesfet` },
    { name: city, url: `${SITE_URL}${cityHref(city)}` },
    ...(category ? [{ name: label, url: `${SITE_URL}${categoryHref(city, category)}` }] : []),
  ];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
    },
    ...(businesses.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: category ? `${city} ${label}` : `${city} işletmeleri`,
            itemListElement: businesses.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${SITE_URL}/${b.slug}` })),
          },
        ]
      : []),
  ];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 md:pt-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }} />
        <nav aria-label="Konum" className="text-sm text-ink-3">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/kesfet" className="hover:text-ink">Keşfet</Link></li>
            <ChevronRight className="size-3.5" aria-hidden />
            <li><Link href={cityHref(city)} className="hover:text-ink">{city}</Link></li>
            {category && (
              <>
                <ChevronRight className="size-3.5" aria-hidden />
                <li aria-current="page" className="font-medium text-ink-2">{label}</li>
              </>
            )}
          </ol>
        </nav>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] md:text-5xl">
          {category ? `${city} ${label}` : `${city} işletmeleri`}
        </h1>
        <p className="mt-3 text-ink-2">
          {businesses.length > 0 ? `${businesses.length === 200 ? "200+" : businesses.length} işletme, puana göre sıralı.` : "Burada henüz işletme yok."}
        </p>

        {present.length > 0 && (
          <nav aria-label="Kategoriler" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
            {present.map((c) => {
              const on = c.id === category;
              return (
                <Link
                  key={c.id}
                  href={categoryHref(city, c.id)}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm ring-1 transition-colors duration-300 ${
                    on ? "bg-brand-400/10 text-accent-strong ring-brand-400/40" : "bg-tint/[0.04] text-ink-2 ring-line hover:bg-tint/[0.08] hover:text-ink"
                  }`}
                >
                  <CategoryIcon id={c.id} className={`size-4 ${on ? "" : "text-accent"}`} /> {c.label}
                </Link>
              );
            })}
          </nav>
        )}

        {businesses.length === 0 ? (
          <div className="card mt-8 grid place-items-center p-12 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-400/10 ring-1 ring-brand-400/20">
              <Store className="size-6 text-accent" />
            </span>
            <p className="mt-4 font-medium">Bu aramada henüz işletme yok</p>
            <Link href="/esnaf" className="btn btn-secondary mt-5">İşletmenizi ekleyin</Link>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => (
              <li key={b.id}><BusinessCard b={b} /></li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
