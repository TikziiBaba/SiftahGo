import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Clock, Globe, MapPin, Megaphone, Phone, Sparkles, Star } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { BookingWidget } from "@/components/booking-widget";
import { ShopShortcuts } from "@/components/shop-shortcuts";
import { createClient } from "@/lib/supabase/server";
import { accentVars, categoryLabel, isSubscribed, SITE_NAME, SITE_URL, WEEKDAYS } from "@/lib/constants";
import { formatDate, isoWeekday, todayStr } from "@/lib/format";
import type { Business, Review, Service, Staff, StaffService, WorkingHour } from "@/lib/types";

const getBusiness = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
  return data as Business | null;
});

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const business = await getBusiness((await params).slug);
  if (!business) return { title: "İşletme bulunamadı" };
  const place = [business.district, business.city].filter(Boolean).join(", ");
  const title = `${business.name} — Online Randevu`;
  // Aramada "şehir + kategori" yazanlara görünmek için açıklama yoksa bunlarla kurulur.
  const description =
    business.description ||
    `${business.name}${place ? ` (${place})` : ""} ${categoryLabel(business.category).toLocaleLowerCase("tr")} için online randevu alın.`;
  const image = business.cover_url ?? business.logo_url;
  return {
    title,
    description,
    alternates: { canonical: `/${business.slug}` },
    // Alt sayfa openGraph verince düzendekinin yerine geçer; site adı ve dil burada da yazılır.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "tr_TR",
      title,
      description,
      url: `/${business.slug}`,
      images: image ? [image] : undefined,
    },
  };
}

export default function BusinessPage({ params }: PageProps<"/[slug]">) {
  return (
    <>
      <SiteHeader minimal />
      <Suspense fallback={<div className="mx-auto h-96 w-full max-w-6xl animate-pulse px-4 py-8" />}>
        <BusinessView params={params} />
      </Suspense>
      <SiteFooter />
    </>
  );
}

async function BusinessView({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const business = await getBusiness((await params).slug);
  if (!business) notFound();

  const supabase = await createClient();
  const [services, staff, hours, reviews, plan] = await Promise.all([
    supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("staff").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("working_hours").select("*").eq("business_id", business.id).order("weekday"),
    supabase.from("reviews").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("plans").select("features").eq("id", business.plan_id ?? "").maybeSingle(),
  ]);
  const staffList = (staff.data ?? []) as Staff[];
  const { data: links } = staffList.length
    ? await supabase.from("staff_services").select("*").in("staff_id", staffList.map((s) => s.id))
    : { data: [] };
  const reviewList = (reviews.data ?? []) as Review[];
  const hourList = (hours.data ?? []) as WorkingHour[];
  const location = [business.address, business.district, business.city].filter(Boolean).join(", ");
  const mapsUrl = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${location}`)}` : null;
  const today = isoWeekday(todayStr());

  // Paketteki özelliğe göre görünen özelleştirmeler; paket düşerse ayarlar saklanır ama gösterilmez.
  const features = isSubscribed(business) ? ((plan.data?.features as string[] | undefined) ?? []) : [];
  const accent = features.includes("theme") ? business.accent : undefined;
  const announcement = features.includes("announcement") ? business.announcement?.trim() : "";
  const custom = features.includes("links");
  const website = custom ? (business.website ?? "") : "";

  // Google'ın işletmeyi tanıması için yapısal veri (adres, telefon, saatler, puan).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
    url: `${SITE_URL}/${business.slug}`,
    description: business.description || undefined,
    image: business.cover_url ?? business.logo_url ?? undefined,
    logo: business.logo_url ?? undefined,
    telephone: business.phone || undefined,
    address: location
      ? {
          "@type": "PostalAddress",
          streetAddress: business.address || undefined,
          addressLocality: business.district || undefined,
          addressRegion: business.city || undefined,
          addressCountry: "TR",
        }
      : undefined,
    openingHoursSpecification: hourList
      .filter((h) => h.is_open)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][h.weekday - 1],
        opens: h.open_time.slice(0, 5),
        closes: h.close_time.slice(0, 5),
      })),
    aggregateRating:
      business.rating_count > 0
        ? { "@type": "AggregateRating", ratingValue: Number(business.rating_avg).toFixed(1), reviewCount: business.rating_count }
        : undefined,
  };

  return (
    <main className="w-full" style={accentVars(accent)}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="relative h-48 overflow-hidden md:h-72">
        {business.cover_url ? (
          <img src={business.cover_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-brand-800 via-brand-950 to-bg">
            <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-400/25 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:22px_22px]" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg to-transparent" />
      </div>

      {/* Kapağın üstüne binen başlık: konumlandırılmış kapağın altında kalmaması için z-10. */}
      <div className="relative z-10 mx-auto -mt-16 max-w-6xl px-4">
        <div className="flex items-end gap-4">
          <div className="size-24 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-300 to-brand-600 shadow-xl ring-4 ring-bg md:size-28">
            {business.logo_url ? (
              <img src={business.logo_url} alt={business.name} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-4xl font-bold text-brand-950">{business.name.charAt(0).toLocaleUpperCase("tr")}</span>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <h1 className="text-balance text-2xl font-bold tracking-tight md:text-4xl">{business.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-3 md:text-base">
              {[categoryLabel(business.category), [business.district, business.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
              {business.rating_count > 0 ? (
                <a href="#yorumlar" className="flex items-center gap-1 font-medium text-ink">
                  <span className="text-ink-3">·</span>
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  {Number(business.rating_avg).toFixed(1)}
                  <span className="font-normal text-ink-3">({business.rating_count})</span>
                </a>
              ) : (
                <span className="chip ml-1 gap-1 bg-brand-400/10 text-brand-300">
                  <Sparkles className="size-3.5" /> Yeni işletme
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <ShopShortcuts
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
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-brand-300">
              <Megaphone className="size-4.5" />
            </span>
            <p className="self-center whitespace-pre-line text-sm leading-relaxed text-ink">{announcement}</p>
          </div>
        )}

        {business.is_suspended && (
          <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
            Bu sayfa yönetici tarafından yayından kaldırıldı; sadece siz görebilirsiniz.
          </p>
        )}
        {!business.is_published && (
          <p className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
            Bu sayfa şu an yayında değil; sadece siz görebilirsiniz. Ayarlardan yayına alabilirsiniz.
          </p>
        )}

        <div className="grid items-start gap-6 py-8 lg:grid-cols-[1fr_360px]">
          {/* min-w-0: kaydırılan gün şeridi sütunu ekrandan genişletmesin */}
          <div id="randevu" className="min-w-0 scroll-mt-28">
            <BookingWidget
              business={business}
              services={(services.data ?? []) as Service[]}
              staff={staffList}
              staffServices={(links ?? []) as StaffService[]}
              hours={hourList}
            />
          </div>

          <aside className="space-y-4">
            {business.description && (
              <section className="card p-5">
                <h2 className="font-semibold">Hakkında</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">{business.description}</p>
              </section>
            )}
            {(location || business.phone || website) && (
              <section className="card space-y-3 p-5 text-sm">
                {location && mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex gap-2.5 text-ink-2 transition-colors hover:text-brand-300">
                    <MapPin className="size-4 shrink-0 translate-y-0.5 text-brand-300" /> {location}
                  </a>
                )}
                {business.phone && (
                  <a href={`tel:${business.phone}`} className="flex gap-2.5 text-ink-2 transition-colors hover:text-brand-300">
                    <Phone className="size-4 shrink-0 translate-y-0.5 text-brand-300" /> {business.phone}
                  </a>
                )}
                {website && (
                  <a href={website} target="_blank" rel="noreferrer" className="flex gap-2.5 break-all text-ink-2 transition-colors hover:text-brand-300">
                    <Globe className="size-4 shrink-0 translate-y-0.5 text-brand-300" /> {website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
              </section>
            )}
            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Clock className="size-4 text-brand-300" /> Çalışma saatleri
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {hourList.map((h) => {
                  const isToday = h.weekday === today;
                  return (
                    <li
                      key={h.weekday}
                      className={`-mx-2 flex justify-between rounded-lg px-2 py-1 ${isToday ? "bg-brand-400/10" : ""}`}
                    >
                      <span className={isToday ? "font-medium text-brand-300" : "text-ink-2"}>
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
            </section>
            {reviewList.length > 0 && (
              <section id="yorumlar" className="card scroll-mt-28 p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Star className="size-4 fill-amber-400 text-amber-400" /> {Number(business.rating_avg).toFixed(1)}
                  <span className="font-normal text-ink-3">· {business.rating_count} değerlendirme</span>
                </h2>
                <ul className="mt-3 space-y-4">
                  {reviewList.map((r) => (
                    <li key={r.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.customer_name}</span>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}
                      <p className="mt-0.5 text-xs text-ink-3">
                        {formatDate(r.created_at, { weekday: undefined, year: "numeric" })} · Randevulu müşteri
                      </p>
                      {r.reply && (
                        <div className="mt-2 rounded-lg border-l-2 border-brand-400/40 bg-white/[0.03] px-3 py-2">
                          <p className="text-xs font-medium text-brand-300">İşletmenin cevabı</p>
                          <p className="mt-0.5 text-ink-2">{r.reply}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {business.gallery.length > 0 && (
              <section className="card p-5">
                <h2 className="font-semibold">Galeri</h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {business.gallery.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover transition-opacity hover:opacity-80" />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${value} yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-3.5 ${i <= value ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
      ))}
    </span>
  );
}
