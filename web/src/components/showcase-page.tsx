import Image from "next/image";
import Link from "next/link";
import { categoryHref } from "@/lib/city-pages";
import { ChevronRight, Clock, Megaphone, Sparkles, Star } from "lucide-react";
import { Morph } from "@/components/business-card";
import { ShopCoupons } from "@/components/shop-coupons";
import { ShopShortcuts } from "@/components/shop-shortcuts";
import { ShowcaseMenu } from "@/components/showcase-menu";
import { TrackRecent } from "@/components/track-recent";
import { accentVars, categoryLabel, menuLabel, WEEKDAYS } from "@/lib/constants";
import { formatDate, isoWeekday, isOpenNow, todayStr } from "@/lib/format";
import type { Business, Review, WorkingHour } from "@/lib/types";

/**
 * Randevusuz (vitrin) işletmenin herkese açık sayfası: kapak, ad ve açık/kapalı, Ara / WhatsApp / Yol tarifi,
 * kuponlar, menü, fotoğraflar, yorumlar. Boş bölümün başlığı çıkmaz. İstek anında çizilir (açık/kapalı şimdiye bakar);
 * kuponlar ve menü tarayıcıda okunur, önbellekteki sayfaya gömülmez.
 */
export function ShowcasePage({
  business,
  reviews,
  hours,
  features,
  jsonLd,
}: {
  business: Business;
  reviews: Review[];
  hours: WorkingHour[];
  /** Paketteki özellikler; abonelik bittiyse boş. */
  features: string[];
  /** Sayfaya konacak yapısal veri (Google). */
  jsonLd: object;
}) {
  const location = [business.address, business.district, business.city].filter(Boolean).join(", ");
  const mapsUrl = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${location}`)}` : null;
  const accent = features.includes("theme") ? business.accent : undefined;
  const announcement = features.includes("announcement") ? business.announcement?.trim() : "";
  const custom = features.includes("links");
  const website = custom ? (business.website ?? "") : "";
  const status = hours.length > 0 ? isOpenNow(hours, business.timezone) : null;
  const today = isoWeekday(todayStr());

  return (
    <main className="w-full" style={accentVars(accent, { light: true })}>
      <TrackRecent slug={business.slug} name={business.name} category={business.category} logo_url={business.logo_url} city={business.city} />
      <nav aria-label="Konum" className="mx-auto max-w-3xl px-4 pb-3">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-3">
          <li>
            <Link href="/" className="hover:text-ink">Ana sayfa</Link>
          </li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li>
            <Link href="/kesfet" className="hover:text-ink">Keşfet</Link>
          </li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li>
            <Link href={categoryHref(business.city, business.category)} className="hover:text-ink">{categoryLabel(business.category)}</Link>
          </li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li aria-current="page" className="max-w-[12rem] truncate font-medium text-ink-2">{business.name}</li>
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <Morph id={business.id} part="kapak">
        <div className="relative mx-auto h-48 max-w-3xl overflow-hidden md:h-64 md:w-[calc(100%-2rem)] md:rounded-3xl">
          {business.cover_url ? (
            <Image src={business.cover_url} alt="" fill preload sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
          ) : (
            <div className="size-full bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800">
              <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-400/25 blur-3xl" />
              <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:22px_22px]" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/25 to-transparent" />
        </div>
      </Morph>

      <div className="relative z-10 mx-auto -mt-12 max-w-3xl px-4 pb-12 md:px-8">
        <div className="flex items-start gap-4">
          <Morph id={business.id} part="logo">
            <div className="size-24 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-300 to-brand-600 shadow-xl ring-4 ring-bg">
              {business.logo_url ? (
                <Image src={business.logo_url} alt={business.name} width={112} height={112} loading="eager" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-4xl font-bold text-brand-950">{business.name.charAt(0).toLocaleUpperCase("tr")}</span>
              )}
            </div>
          </Morph>
          <div className="min-w-0 pt-14">
            <h1 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">{business.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-3">
              {[categoryLabel(business.category), [business.district, business.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
              {business.rating_count > 0 ? (
                <a href="#yorumlar" className="flex items-center gap-1 font-medium text-ink">
                  <span className="text-ink-3">·</span>
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  {Number(business.rating_avg).toFixed(1)}
                  <span className="font-normal text-ink-3">({business.rating_count})</span>
                </a>
              ) : (
                <span className="chip ml-1 gap-1 bg-brand-400/10 text-accent">
                  <Sparkles className="size-3.5" /> Yeni işletme
                </span>
              )}
            </p>
          </div>
        </div>

        {status && (
          <details className="group mt-4">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <span className={`size-2.5 rounded-full ${status.open ? "bg-ok" : "bg-ink-3"}`} aria-hidden />
              <span className={`font-semibold ${status.open ? "text-ok" : "text-ink-2"}`}>{status.open ? "Açık" : "Kapalı"}</span>
              {status.open && status.until && <span className="text-ink-3">· Kapanış {status.until}</span>}
              <span className="inline-flex items-center gap-1 text-ink-3 underline-offset-2 group-open:underline">
                <Clock className="size-3.5" /> Saatler
              </span>
            </summary>
            <ul className="card mt-3 space-y-1 p-4 text-sm">
              {hours.map((h) => {
                const isToday = h.weekday === today;
                return (
                  <li key={h.weekday} className={`-mx-2 flex justify-between rounded-lg px-2 py-1 ${isToday ? "bg-brand-400/10" : ""}`}>
                    <span className={isToday ? "font-medium text-accent" : "text-ink-2"}>
                      {WEEKDAYS[h.weekday - 1]}
                      {isToday && " · Bugün"}
                    </span>
                    <span className={`tabular-nums ${h.is_open ? "font-medium" : "text-ink-3"}`}>
                      {h.is_open ? `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}` : "Kapalı"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {business.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-2">{business.description}</p>}

        <div className="mt-5">
          <ShopShortcuts
            showcase
            businessId={business.id}
            slug={business.slug}
            name={business.name}
            phone={business.phone}
            mapsUrl={mapsUrl}
            whatsapp={custom ? (business.whatsapp ?? "") : ""}
            instagram={custom ? (business.instagram ?? "") : ""}
            website={website}
          />
        </div>

        {announcement && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-brand-400/10 p-4 ring-1 ring-brand-400/25">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-accent">
              <Megaphone className="size-4.5" />
            </span>
            <p className="self-center whitespace-pre-line text-sm leading-relaxed text-ink">{announcement}</p>
          </div>
        )}

        {business.is_suspended && (
          <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-bad">
            Bu sayfa yönetici tarafından yayından kaldırıldı; sadece siz görebilirsiniz.
          </p>
        )}
        {!business.is_published && (
          <p className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-warn">
            Bu sayfa şu an yayında değil; sadece siz görebilirsiniz. Ayarlardan yayına alabilirsiniz.
          </p>
        )}

        {features.includes("coupons") && <ShopCoupons showcase businessId={business.id} slug={business.slug} services={[]} />}

        <ShowcaseMenu businessId={business.id} label={menuLabel(business.category)} />

        {business.gallery.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-semibold">Fotoğraflar</h2>
            <div className="grid grid-cols-3 gap-2">
              {business.gallery.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <Image
                    src={url}
                    alt={`${business.name} fotoğraf ${i + 1}`}
                    width={240}
                    height={240}
                    sizes="(min-width: 768px) 220px, 33vw"
                    className="aspect-square w-full rounded-lg object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {reviews.length > 0 && (
          <section id="yorumlar" className="card mt-8 scroll-mt-28 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Star className="size-4 fill-amber-400 text-amber-400" /> {Number(business.rating_avg).toFixed(1)}
              <span className="font-normal text-ink-3">· {business.rating_count} değerlendirme</span>
            </h2>
            <p className="mt-1 text-xs text-ink-3">Yorumlar, kuponu kasada kullanan müşterilerden gelir.</p>
            <ul className="mt-3 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.customer_name}</span>
                    <span className="flex" aria-label={`${r.rating} yıldız`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`size-3.5 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
                      ))}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}
                  <p className="mt-0.5 text-xs text-ink-3">
                    {formatDate(r.created_at, { weekday: undefined, year: "numeric" })}
                    {r.coupon_claim_id ? " · Kupon kullanan müşteri" : ""}
                  </p>
                  {r.reply && (
                    <div className="mt-2 rounded-lg border-l-2 border-brand-400/40 bg-tint/[0.03] px-3 py-2">
                      <p className="text-xs font-medium text-accent">İşletmenin cevabı</p>
                      <p className="mt-0.5 text-ink-2">{r.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
