import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { cache, Suspense, ViewTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, Clock, Globe, MapPin, Megaphone, Phone, Sparkles, Star } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { BookingWidget } from "@/components/booking-widget";
import { Morph } from "@/components/business-card";
import { ShopShortcuts } from "@/components/shop-shortcuts";
import { TrackRecent } from "@/components/track-recent";
import { createClient } from "@/lib/supabase/server";
import { accentVars, categoryLabel, isSubscribed, SITE_NAME, SITE_URL, WEEKDAYS } from "@/lib/constants";
import { formatDate, isoWeekday, todayStr } from "@/lib/format";
import type { Business, Review, Service, Staff, StaffService, WorkingHour } from "@/lib/types";

type BusinessData = {
  business: Business;
  services: Service[];
  staff: Staff[];
  staffServices: StaffService[];
  hours: WorkingHour[];
  reviews: Review[];
  /** Paketteki özellikler; abonelik bittiyse boş (özelleştirmeler gizlenir). */
  features: string[];
};

type BusinessRow = Business & {
  plan: { features: string[] } | null;
  services: Service[];
  staff: (Staff & { staff_services: StaffService[] })[];
  working_hours: WorkingHour[];
  reviews: Review[];
};

// Sayfanın tüm verisi tek sorguda: işletme, paket özellikleri, hizmetler, personel ve hizmetleri, saatler, son 10 yorum.
async function loadBusiness(supabase: SupabaseClient, slug: string): Promise<BusinessData | null> {
  const { data } = await supabase
    .from("businesses")
    .select("*, plan:plans!businesses_plan_id_fkey(features), services(*), staff(*, staff_services(*)), working_hours(*), reviews(*)")
    .eq("slug", slug)
    .eq("services.is_active", true)
    .eq("staff.is_active", true)
    .order("sort_order", { referencedTable: "services" })
    .order("created_at", { referencedTable: "services" })
    .order("sort_order", { referencedTable: "staff" })
    .order("created_at", { referencedTable: "staff" })
    .order("weekday", { referencedTable: "working_hours" })
    .order("created_at", { referencedTable: "reviews", ascending: false })
    .limit(10, { referencedTable: "reviews" })
    .maybeSingle();
  if (!data) return null;
  const { plan, services, staff, working_hours, reviews, ...business } = data as BusinessRow;
  return {
    business,
    services,
    staff,
    staffServices: staff.flatMap((s) => s.staff_services),
    hours: working_hours,
    reviews,
    features: isSubscribed(business) ? (plan?.features ?? []) : [],
  };
}

// Yayındaki işletmenin sayfası herkes için aynı: çerezsiz istemciyle okunur ve önbellekte tutulur (dakikada bir
// tazelenir). Böylece sayfa veritabanına gitmeden, hazır HTML olarak açılır. Boş saatler ve randevu tarayıcıda canlı
// sorulur.
async function getPublicBusiness(slug: string) {
  "use cache";
  cacheLife("minutes");
  const supabase = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return loadBusiness(supabase, slug);
}

// Herkese açık değilse (yayında değil, onay bekliyor, askıda) sahibi ve yönetici kendi oturumuyla görür.
const getBusiness = cache(async (slug: string) => (await getPublicBusiness(slug)) ?? loadBusiness(await createClient(), slug));

// En yüksek puanlı işletmeler derlemede hazırlanır; diğerleri ilk ziyarette hazırlanıp saklanır (ISR). Bu olmadan adres
// her istekte çözülür ve sayfa her seferinde sunucuda üretilir. Cache Components en az bir değer ister: hiç işletme
// yoksa var olmayan bir adres verilir (404 olur).
export async function generateStaticParams() {
  const supabase = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.from("businesses").select("slug").eq("is_published", true).order("rating_score", { ascending: false }).limit(20);
  return data?.length ? data.map((b) => ({ slug: b.slug as string })) : [{ slug: "isletme-yok" }];
}

// Yalnızca herkese açık (önbellekteki) veriden: çerez okunursa sayfa önceden hazırlanamaz. Yayında olmayan sayfayı
// sahibi açtığında genel başlık görünür.
export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const business = (await getPublicBusiness((await params).slug))?.business;
  if (!business) return { title: "İşletme sayfası", robots: { index: false } };
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
      {/* Yer tutucu ekran boyunda: içerik gelince alt bilgi görünür alanda kaymasın. Gelince yer tutucu aşağı
          kayıp çekilir, sayfa yukarı kayarak gelir (globals.css). */}
      <Suspense
        fallback={
          <ViewTransition exit="slide-down" default="none">
            <div className="mx-auto min-h-[100dvh] w-full max-w-6xl animate-pulse px-4 py-8" />
          </ViewTransition>
        }
      >
        <ViewTransition enter="slide-up" default="none">
          <BusinessView params={params} />
        </ViewTransition>
      </Suspense>
      <SiteFooter />
    </>
  );
}

async function BusinessView({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const data = await getBusiness((await params).slug);
  if (!data) notFound();

  const { business, services, staff: staffList, staffServices, hours: hourList, reviews: reviewList, features } = data;
  const location = [business.address, business.district, business.city].filter(Boolean).join(", ");
  const mapsUrl = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${location}`)}` : null;

  // Paketteki özelliğe göre görünen özelleştirmeler; paket düşerse ayarlar saklanır ama gösterilmez.
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
    <main className="w-full" style={accentVars(accent, { light: true })}>
      <TrackRecent slug={business.slug} name={business.name} category={business.category} logo_url={business.logo_url} city={business.city} />
      {/* Nerede olduğunu gösteren yol: müşteri tek dokunuşla kategoriye veya Keşfet'e döner. */}
      <nav aria-label="Konum" className="mx-auto max-w-6xl px-4 pb-3">
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
            <Link href={`/kesfet?kategori=${business.category}`} className="hover:text-ink">{categoryLabel(business.category)}</Link>
          </li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li aria-current="page" className="max-w-[12rem] truncate font-medium text-ink-2">{business.name}</li>
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {/* Keşfet kartındaki kapak ve logo buraya uçar (business-card.tsx Morph). */}
      <Morph id={business.id} part="kapak">
        <div className="relative mx-auto h-48 max-w-6xl overflow-hidden md:h-72 md:w-[calc(100%-2rem)] md:rounded-3xl">
          {business.cover_url ? (
            // Sayfanın en büyük öğesi: önceden yüklenir.
            <Image src={business.cover_url} alt="" fill preload sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />
          ) : (
            <div className="size-full bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800">
              <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-400/25 blur-3xl" />
              <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:22px_22px]" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/25 to-transparent" />
        </div>
      </Morph>

      {/* Kapağın üstüne binen başlık: konumlandırılmış kapağın altında kalmaması için z-10. */}
      <div className="relative z-10 mx-auto -mt-12 max-w-6xl px-4 md:px-8">
        {/* Logo kapağa biner; ad ve bilgiler kapağın altında kalır (açık zeminde okunur). */}
        <div className="flex items-start gap-4">
          <Morph id={business.id} part="logo">
            <div className="size-24 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-300 to-brand-600 shadow-xl ring-4 ring-bg md:size-28">
              {business.logo_url ? (
                <Image src={business.logo_url} alt={business.name} width={112} height={112} loading="eager" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-4xl font-bold text-brand-950">{business.name.charAt(0).toLocaleUpperCase("tr")}</span>
              )}
            </div>
          </Morph>
          <div className="min-w-0 pt-14 md:pt-16">
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
                <span className="chip ml-1 gap-1 bg-brand-400/10 text-accent">
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

        <div className="grid items-start gap-6 py-8 lg:grid-cols-[1fr_360px]">
          {/* min-w-0: kaydırılan gün şeridi sütunu ekrandan genişletmesin */}
          <div id="randevu" className="min-w-0 scroll-mt-28">
            {/* Randevu kutusu bugünün tarihine ve adresteki ?hizmet/?gun'e bakar: önbellekteki sayfaya her istekte eklenir. */}
            <Suspense fallback={<div className="card min-h-[28rem] animate-pulse" />}>
              <BookingWidget
                business={{
                  id: business.id,
                  slug: business.slug,
                  name: business.name,
                  address: business.address,
                  district: business.district,
                  city: business.city,
                  booking_days: business.booking_days,
                  auto_confirm: business.auto_confirm,
                }}
                services={services}
                staff={staffList}
                staffServices={staffServices}
                hours={hourList}
              />
            </Suspense>
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
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex gap-2.5 text-ink-2 transition-colors hover:text-accent">
                    <MapPin className="size-4 shrink-0 translate-y-0.5 text-accent" /> {location}
                  </a>
                )}
                {business.phone && (
                  <a href={`tel:${business.phone}`} className="flex gap-2.5 text-ink-2 transition-colors hover:text-accent">
                    <Phone className="size-4 shrink-0 translate-y-0.5 text-accent" /> {business.phone}
                  </a>
                )}
                {website && (
                  <a href={website} target="_blank" rel="noreferrer" className="flex gap-2.5 break-all text-ink-2 transition-colors hover:text-accent">
                    <Globe className="size-4 shrink-0 translate-y-0.5 text-accent" /> {website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
              </section>
            )}
            <Suspense fallback={<Hours hours={hourList} today={null} />}>
              <TodayHours hours={hourList} />
            </Suspense>
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
            {business.gallery.length > 0 && (
              <section className="card p-5">
                <h2 className="font-semibold">Galeri</h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {business.gallery.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <Image
                        src={url}
                        alt=""
                        width={240}
                        height={240}
                        sizes="(min-width: 1024px) 110px, 33vw"
                        className="aspect-square w-full rounded-lg object-cover transition-opacity hover:opacity-80"
                      />
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

// "Bugün" satırı istek anındaki güne göre işaretlenir; sayfanın geri kalanı önbellekten gelir.
async function TodayHours({ hours }: { hours: WorkingHour[] }) {
  await connection();
  return <Hours hours={hours} today={isoWeekday(todayStr())} />;
}

function Hours({ hours, today }: { hours: WorkingHour[]; today: number | null }) {
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Clock className="size-4 text-accent" /> Çalışma saatleri
      </h2>
      <ul className="mt-3 space-y-1 text-sm">
        {hours.map((h) => {
          const isToday = h.weekday === today;
          return (
            <li
              key={h.weekday}
              className={`-mx-2 flex justify-between rounded-lg px-2 py-1 ${isToday ? "bg-brand-400/10" : ""}`}
            >
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
    </section>
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
