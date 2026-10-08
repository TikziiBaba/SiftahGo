import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Clock, MapPin, Phone, Star } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { BookingWidget } from "@/components/booking-widget";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, WEEKDAYS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Business, Review, Service, Staff, StaffService, WorkingHour } from "@/lib/types";

const getBusiness = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
  return data as Business | null;
});

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const business = await getBusiness((await params).slug);
  if (!business) return { title: "İşletme bulunamadı" };
  return {
    title: `${business.name} — Online Randevu`,
    description: business.description || `${business.name} için online randevu alın.`,
    openGraph: business.cover_url ? { images: [business.cover_url] } : undefined,
  };
}

export default function BusinessPage({ params }: PageProps<"/[slug]">) {
  return (
    <>
      <SiteHeader />
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
  const [services, staff, hours, reviews] = await Promise.all([
    supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("staff").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("working_hours").select("*").eq("business_id", business.id).order("weekday"),
    supabase.from("reviews").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const staffList = (staff.data ?? []) as Staff[];
  const { data: links } = staffList.length
    ? await supabase.from("staff_services").select("*").in("staff_id", staffList.map((s) => s.id))
    : { data: [] };
  const reviewList = (reviews.data ?? []) as Review[];
  const hourList = (hours.data ?? []) as WorkingHour[];
  const location = [business.address, business.district, business.city].filter(Boolean).join(", ");

  return (
    <main className="w-full">
      <div className="h-44 bg-gradient-to-br from-brand-700 to-brand-500 md:h-64">
        {business.cover_url && <img src={business.cover_url} alt="" className="size-full object-cover" />}
      </div>
      <div className="mx-auto max-w-6xl px-4">
        <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-brand-700 shadow-lg">
            {business.logo_url ? (
              <img src={business.logo_url} alt={business.name} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-3xl font-bold text-white">{business.name.charAt(0)}</span>
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{business.name}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-stone-500">
              {categoryLabel(business.category)}
              {business.city && ` · ${business.city}`}
              {business.rating_count > 0 && (
                <a href="#yorumlar" className="flex items-center gap-1 font-medium text-stone-800">
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  {Number(business.rating_avg).toFixed(1)}{" "}
                  <span className="font-normal text-stone-500">({business.rating_count} değerlendirme)</span>
                </a>
              )}
            </p>
          </div>
        </div>
        {!business.is_published && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Bu sayfa şu an yayında değil; sadece siz görebilirsiniz. Ayarlardan yayına alabilirsiniz.
          </p>
        )}

        <div className="grid gap-6 py-8 lg:grid-cols-[1fr_340px]">
          <BookingWidget
            business={business}
            services={(services.data ?? []) as Service[]}
            staff={staffList}
            staffServices={(links ?? []) as StaffService[]}
            hours={hourList}
          />

          <aside className="space-y-4">
            {business.description && (
              <section className="card p-5">
                <h2 className="font-semibold">Hakkında</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-stone-600">{business.description}</p>
              </section>
            )}
            <section className="card space-y-3 p-5 text-sm">
              {location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${location}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-2.5 text-stone-700 hover:text-brand-700"
                >
                  <MapPin className="size-4 shrink-0 translate-y-0.5" /> {location}
                </a>
              )}
              {business.phone && (
                <a href={`tel:${business.phone}`} className="flex gap-2.5 text-stone-700 hover:text-brand-700">
                  <Phone className="size-4 shrink-0 translate-y-0.5" /> {business.phone}
                </a>
              )}
            </section>
            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Clock className="size-4" /> Çalışma saatleri
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {hourList.map((h) => (
                  <li key={h.weekday} className="flex justify-between">
                    <span className="text-stone-600">{WEEKDAYS[h.weekday - 1]}</span>
                    <span className={h.is_open ? "font-medium" : "text-stone-400"}>
                      {h.is_open ? `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}` : "Kapalı"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {reviewList.length > 0 && (
              <section id="yorumlar" className="card p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Star className="size-4 fill-amber-400 text-amber-400" /> {Number(business.rating_avg).toFixed(1)}
                  <span className="font-normal text-stone-500">· {business.rating_count} değerlendirme</span>
                </h2>
                <ul className="mt-3 space-y-4">
                  {reviewList.map((r) => (
                    <li key={r.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.customer_name}</span>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment && <p className="mt-1 text-stone-600">{r.comment}</p>}
                      <p className="mt-0.5 text-xs text-stone-400">{formatDate(r.created_at, { weekday: undefined, year: "numeric" })}</p>
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
                      <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
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
        <Star key={i} className={`size-3.5 ${i <= value ? "fill-amber-400 text-amber-400" : "text-stone-300"}`} />
      ))}
    </span>
  );
}
