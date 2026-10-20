import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  CalendarClock,
  LayoutGrid,
  LocateFixed,
  MapPin,
  Scissors,
  Search,
  Sparkles,
  Star,
  Store,
  type LucideIcon,
} from "lucide-react";
import { BusinessCard, type BusinessCardData } from "@/components/business-card";
import { GlowCard } from "@/components/glow-card";
import { AppDownload, Backdrop, BookingMock, GridFloor, PrimaryCta, SectionHead } from "@/components/landing";
import { GuestOnly, MemberHome } from "@/components/member-home";
import { NearbyResults } from "@/components/nearby-results";
import { Reveal } from "@/components/reveal";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Shop } from "@/components/three/shop";
import { CATEGORY_ICONS, CategoryIcon } from "@/lib/category-icons";
import { CATEGORIES, CITIES, SITE_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Müşterilerin ana sayfası: işletme bulma ve randevu alma. İşletme sahiplerininki /esnaf.
export default function Home() {
  return (
    <>
      <Backdrop />
      <SiteHeader />
      <main className="relative">
        {/* Google arama sonucunda site adının doğru görünmesi için. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
              { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/apple-icon.png` },
            ]),
          }}
        />
        {/* Giriş yapmış üye kendi özetini görür; tanıtım bölümleri yalnızca ziyaretçiye. */}
        <MemberHome />
        <GuestOnly>
          <Hero />
        </GuestOnly>
        <Suspense fallback={<div className="h-[22rem]" />}>
          <Shelves />
        </Suspense>
        <Categories />
        <Suspense fallback={<div className="h-[40rem]" />}>
          <Businesses />
        </Suspense>
        <GuestOnly>
          <HowToBook />
        </GuestOnly>
        <Suspense fallback={<div className="h-[36rem]" />}>
          <AppDownload />
        </Suspense>
        <GuestOnly>
          <ForBusinesses />
        </GuestOnly>
      </main>
      <SiteFooter />
    </>
  );
}

const pill =
  "inline-flex items-center gap-2 rounded-full bg-tint/[0.04] px-4 py-2 text-sm text-ink-2 ring-1 ring-line transition-colors duration-300 hover:bg-tint/[0.08] hover:text-ink";

/* ------------------------------------------------------------------ */
/* Hero: arama ve hızlı yollar                                          */
/* ------------------------------------------------------------------ */
function Hero() {
  const popular = ["berber", "kuafor", "guzellik", "hali-saha"] as const;
  return (
    <section className="relative isolate overflow-x-clip">
      <GridFloor />
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-16 pt-6 md:pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="relative z-10">
          <Reveal onLoad>
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-gold shadow-[0_0_8px_rgb(245_181_68)]" />
              Ücretsiz online randevu
            </span>
          </Reveal>
          <Reveal onLoad delay={80}>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] md:text-7xl">
              Sıra beklemeden,
              <br />
              <span className="text-gradient">saatini seç.</span>
            </h1>
          </Reveal>
          <Reveal onLoad delay={160}>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-2">
              Berber, kuaför, güzellik salonu, halı saha ve daha fazlası. Boş
              saatleri gör, randevunu saniyeler içinde al; aramak, beklemek yok.
            </p>
          </Reveal>
          <Reveal onLoad delay={240}>
            <Form action="/kesfet" className="bezel mt-9 max-w-xl">
              <div className="bezel-core grid grid-cols-[1fr_auto] gap-2 p-2 sm:grid-cols-[1fr_10rem_auto]">
                <div className="relative col-span-2 sm:col-span-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                  <input name="q" placeholder="İşletme adı ara" aria-label="İşletme adı" className="input py-3 pl-10" />
                </div>
                <select name="sehir" defaultValue="" aria-label="Şehir" className="input py-3">
                  <option value="">Tüm şehirler</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button className="btn btn-primary px-6">Ara</button>
              </div>
            </Form>
          </Reveal>
          <Reveal onLoad delay={320}>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/kesfet?bugun=1" className={pill}>
                <CalendarClock className="size-4 text-accent" /> Bugün müsait
              </Link>
              <Link href="#yakinimda" className={pill}>
                <LocateFixed className="size-4 text-accent" /> Yakınımda
              </Link>
              {popular.map((id) => (
                <Link key={id} href={`/kesfet?kategori=${id}`} className={pill}>
                  <CategoryIcon id={id} className="size-4 text-accent" /> {CATEGORIES.find((c) => c.id === id)?.label}
                </Link>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal onLoad delay={200}>
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

function HeroVisual() {
  const rows: [LucideIcon, string, string][] = [
    [Scissors, "Usta Berber", "Saç Kesimi · Ali Usta · ₺300"],
    [MapPin, "Kadıköy, İstanbul", "1,2 km uzaklıkta"],
    [BellRing, "Hatırlatma", "1 gün ve 2 saat önce"],
  ];
  return (
    <div className="relative mx-auto h-[34rem] max-w-lg lg:h-[38rem] lg:max-w-none">
      {/* Işık ve 3D dükkân */}
      <div className="absolute right-0 top-6 -z-10 size-80 rounded-full bg-gold/10 blur-3xl" />
      <div className="absolute bottom-10 left-0 -z-10 size-72 rounded-full bg-brand-400/15 blur-3xl" />
      <Shop
        className="absolute inset-0"
        focus={{ x: 0.28, y: 0.38 }}
        scale={1.25}
        narrowFocus={{ x: 0.05, y: 0.5 }}
      />

      {/* 3D eğik randevu kartı */}
      <div className="absolute bottom-0 left-0 w-full max-w-[23rem]">
        <GlowCard className="tilt bezel [--bx:6deg] [--by:-8deg] lg:[--bx:9deg] lg:[--by:-16deg]">
          <div className="bezel-core p-5 [transform-style:preserve-3d]">
            <div className="depth-2 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-400 text-brand-950">
                <CalendarCheck className="size-5" style={{ strokeWidth: 2 }} />
              </span>
              <div>
                <p className="text-3xs font-medium uppercase tracking-[0.2em] text-ink-3">
                  Randevun onaylandı
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  Cuma 10 Ekim · 13:00
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-2 [transform-style:preserve-3d]">
              {rows.map(([Icon, title, text]) => (
                <li
                  key={title}
                  className="depth-1 flex items-center gap-3 rounded-2xl bg-tint/[0.04] p-3 ring-1 ring-line"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-accent">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <p className="truncate text-xs text-ink-3">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </GlowCard>
      </div>

      {/* Yüzen "bugün müsait" */}
      <div className="animate-float absolute left-0 top-4 hidden w-64 sm:block">
        <div className="bezel rounded-3xl p-1 backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-[calc(1.5rem-0.25rem)] bg-surface-2/90 p-3 shadow-[inset_0_1px_1px_rgb(255_255_255/0.06)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-400/15 text-accent">
              <CalendarClock className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">Bugün müsait</p>
              <p className="truncate text-xs text-ink-3">14:30 · 15:00 · 16:30</p>
            </div>
          </div>
        </div>
      </div>

      {/* Yüzen puan */}
      <div
        className="animate-float absolute bottom-48 right-0 hidden sm:block"
        style={{ animationDelay: "-3s" }}
      >
        <div className="bezel rounded-3xl p-1 backdrop-blur-md">
          <div className="flex items-center gap-2 rounded-[calc(1.5rem-0.25rem)] bg-surface-2/90 px-4 py-3 shadow-[inset_0_1px_1px_rgb(255_255_255/0.06)]">
            <Star className="size-4 fill-gold text-gold" />
            <span className="text-sm font-semibold">4,9</span>
            <span className="text-xs text-ink-3">128 yorum</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raflar: bugün boş saati olanlar ve yeni katılanlar (her ziyarette farklı) */
/* ------------------------------------------------------------------ */
const CARD_FIELDS = "id, slug, name, category, city, district, logo_url, cover_url, rating_avg, rating_count";

async function getShelves(): Promise<{ today: BusinessCardData[]; newest: BusinessCardData[] }> {
  "use cache";
  cacheLife("minutes");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { today: [], newest: [] };
  try {
    const supabase = createSupabase(url, key);
    const [top, fresh] = await Promise.all([
      supabase.from("businesses").select(CARD_FIELDS).eq("is_published", true).order("rating_score", { ascending: false }).limit(40),
      supabase.from("businesses").select(CARD_FIELDS).eq("is_published", true).order("created_at", { ascending: false }).limit(8),
    ]);
    const candidates = (top.data ?? []) as BusinessCardData[];
    const { data: open } = candidates.length
      ? await supabase.rpc("available_today", { p_ids: candidates.map((b) => b.id) })
      : { data: [] };
    const ids = new Set((open ?? []) as string[]);
    return { today: candidates.filter((b) => ids.has(b.id)).slice(0, 8), newest: (fresh.data ?? []) as BusinessCardData[] };
  } catch {
    return { today: [], newest: [] };
  }
}

async function Shelves() {
  const { today, newest } = await getShelves();
  if (today.length === 0 && newest.length === 0) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 pt-6">
      {today.length > 0 && (
        <BusinessShelf
          icon={CalendarClock}
          title="Bugün boş saati olanlar"
          text="Bugün randevu verebilen işletmeler, puana göre"
          more={{ href: "/kesfet?bugun=1", label: "Tümü" }}
          items={today}
        />
      )}
      {newest.length > 0 && (
        <BusinessShelf icon={Sparkles} title="Yeni katılanlar" text="SiftahGo’ya yeni gelen esnaf" more={{ href: "/kesfet", label: "Keşfet" }} items={newest} />
      )}
    </div>
  );
}

function BusinessShelf({
  icon: Icon,
  title,
  text,
  more,
  items,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  more: { href: string; label: string };
  items: BusinessCardData[];
}) {
  return (
    <Reveal as="section">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Icon className="size-5 text-accent" /> {title}
          </h2>
          <p className="text-sm text-ink-3">{text}</p>
        </div>
        <Link href={more.href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline">
          {more.label} <ArrowRight className="size-4" />
        </Link>
      </div>
      {/* Yana kayan raf; telefonda bir sonraki kart yarım görünür. */}
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {items.map((b) => (
          <li key={b.id} className="w-72 shrink-0 snap-start">
            <BusinessCard b={b} />
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* Kategoriler                                                          */
/* ------------------------------------------------------------------ */
function Categories() {
  const items = [
    ...CATEGORIES.filter((c) => c.id !== "diger").map((c) => ({
      href: `/kesfet?kategori=${c.id}`,
      label: c.label,
      Icon: CATEGORY_ICONS[c.id],
    })),
    { href: "/kesfet", label: "Tüm işletmeler", Icon: LayoutGrid },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <SectionHead
        id="kategoriler"
        eyebrow="Kategoriler"
        title={
          <>
            Ne arıyorsan,{" "}
            <span className="text-gradient">tek dokunuşta</span>
          </>
        }
        text="Kategoriyi seç, o alandaki işletmeleri puana göre gör."
      />
      <ul className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(({ href, label, Icon }, i) => (
          <Reveal as="li" key={href} delay={(i % 4) * 60}>
            <GlowCard className="card h-full">
              <Link
                href={href}
                className="group flex h-full items-center gap-3 rounded-[inherit] p-4 transition-colors duration-300 hover:bg-tint/[0.03]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-accent ring-1 ring-brand-400/20">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{label}</span>
                <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform duration-500 ease-spring group-hover:translate-x-0.5 group-hover:text-ink max-sm:hidden" />
              </Link>
            </GlowCard>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* İşletmeler: öne çıkanlar, Yakınımda ve Bugün müsait                   */
/* ------------------------------------------------------------------ */
async function getFeatured(): Promise<BusinessCardData[]> {
  "use cache";
  cacheLife("minutes");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const { data } = await createSupabase(url, key)
      .from("businesses")
      .select("id, slug, name, category, city, district, logo_url, cover_url, rating_avg, rating_count")
      .eq("is_published", true)
      .order("rating_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6);
    return (data ?? []) as BusinessCardData[];
  } catch {
    return [];
  }
}

async function Businesses() {
  const businesses = await getFeatured();
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <SectionHead
        id="yakinimda"
        eyebrow="İşletmeler"
        title={
          <>
            Yakınında, <span className="text-gradient">saati boş.</span>
          </>
        }
        text="Konumunu paylaş, 50 km içindeki işletmeleri uzaklığa göre gör. Konumun sunucuda saklanmaz."
      />
      <Reveal className="mt-12">
        <NearbyResults
          category=""
          query=""
          today={false}
          actions={
            <>
              <Link href="/kesfet?bugun=1" className="btn btn-secondary">
                <CalendarClock className="size-4 text-accent" /> Bugün müsait
              </Link>
              <Link href="/kesfet" className="btn btn-ghost">
                Tüm işletmeler <ArrowRight className="size-4" />
              </Link>
            </>
          }
        >
          {businesses.length === 0 ? (
            <div className="card mt-6 grid place-items-center p-12 text-center">
              <Store className="size-10 text-ink-3" />
              <p className="mt-3 font-medium">İşletmeler yakında burada</p>
              <p className="mt-1 text-sm text-ink-3">Keşfet sayfasından kategori ve şehre göre arayabilirsiniz.</p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {businesses.map((b) => (
                <li key={b.id}>
                  <BusinessCard b={b} />
                </li>
              ))}
            </ul>
          )}
        </NearbyResults>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Nasıl randevu alınır                                                 */
/* ------------------------------------------------------------------ */
function HowToBook() {
  const steps = [
    {
      title: "İşletmeni bul",
      text: "Kategori ya da şehir seç, yakınındakilere bak. Puanlar ve yorumlar seçmeni kolaylaştırır.",
    },
    {
      title: "Hizmeti ve saati seç",
      text: "Yalnızca boş saatler görünür. Hizmeti, ustanı ve sana uyan saati seç.",
    },
    {
      title: "Hesabınla onayla",
      text: "Randevun anında kaydedilir, 1 gün ve 2 saat önce hatırlatma gelir. Ertelemek ya da iptal etmek Randevularım’da.",
    },
  ];
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
      <SectionHead
        id="nasil"
        eyebrow="Nasıl randevu alınır"
        title={
          <>
            Üç adımda <span className="text-gradient">randevun hazır</span>
          </>
        }
        text="Randevu almak ücretsiz. Aramak, sıra beklemek yok."
      />
      <div className="mt-16 grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        <ol className="space-y-10">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 120} className="flex gap-6">
              <span className="text-extrude w-20 shrink-0 text-6xl font-semibold tracking-tighter [transform:perspective(500px)_rotateX(14deg)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-3">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
        <Reveal delay={120}>
          <GlowCard className="bezel">
            <div className="bezel-core p-5 md:p-7">
              <p className="mb-4 text-3xs font-medium uppercase tracking-[0.2em] text-ink-3">
                Usta Berber · Randevu al
              </p>
              <BookingMock />
            </div>
          </GlowCard>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* İşletme sahiplerine geçiş                                            */
/* ------------------------------------------------------------------ */
function ForBusinesses() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-28">
      <Reveal className="bezel">
        <div className="bezel-core relative grid items-center gap-8 overflow-hidden px-6 py-14 md:grid-cols-[1.4fr_auto] md:px-14 md:py-16">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-gold/15 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-64 w-[32rem] rounded-full bg-brand-400/15 blur-3xl" />
          <div className="relative">
            <span className="eyebrow">
              <Store className="size-3.5" /> İşletmeler için
            </span>
            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.03em] md:text-5xl">
              İşletmeniz mi var?{" "}
              <span className="text-gradient">Müşterileriniz buradan randevu alsın.</span>
            </h2>
            <p className="mt-4 max-w-xl text-lg text-ink-2">
              Online randevu, çakışmasız takvim, müşteri defteri ve hatırlatmalar. İlk 7 gün ücretsiz, taahhüt yok.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3 md:flex-col">
            <PrimaryCta href="/esnaf">İşletmeler için</PrimaryCta>
            <Link href="/kayit?rol=isletme" className="btn btn-secondary px-6 py-3.5 text-base">
              İşletmeni aç
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
