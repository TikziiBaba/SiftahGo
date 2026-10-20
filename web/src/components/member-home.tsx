"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  Compass,
  Eye,
  Heart,
  LayoutDashboard,
  LocateFixed,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";
import { categoryLabel } from "@/lib/constants";
import { formatDate, formatTime, untilText } from "@/lib/format";
import { getRecent, type RecentBusiness } from "@/lib/recent";
import { createClient } from "@/lib/supabase/client";
import { useAccount, type Account } from "@/lib/use-account";

type Biz = { name: string; slug: string; phone: string; logo_url: string | null; category: string; address: string; district: string; city: string };
type Appt = {
  id: string;
  starts_at: string;
  status: string;
  service_id: string | null;
  staff_id: string | null;
  service_name: string;
  businesses: Biz | null;
};
type Fav = Pick<Biz, "slug" | "name" | "logo_url" | "category" | "district" | "city">;

/** Yalnızca ziyaretçiye (giriş yapmamış) gösterilir. Sunucuda ve ilk çizimde görünür (arama motorları için). */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  return account && account.kind !== "guest" ? null : children;
}

/** Giriş yapmış üyenin ana sayfası: sıradaki randevu, tekrar al, favoriler, son bakılanlar. */
export function MemberHome() {
  const account = useAccount();
  if (!account || account.kind === "guest") return null;
  return <MemberDashboard account={account} />;
}

function greeting(hour: number) {
  if (hour < 5) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

function MemberDashboard({ account }: { account: Exclude<Account, { kind: "guest" }> }) {
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [favs, setFavs] = useState<Fav[]>([]);
  // Bu bileşen yalnızca tarayıcıda (oturum okunduktan sonra) çizilir; yerel depoyu ilk değerde okumak güvenli.
  const [recent] = useState<RecentBusiness[]>(getRecent);
  const [now] = useState(() => new Date());

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, status, service_id, staff_id, service_name, businesses(name, slug, phone, logo_url, category, address, district, city)")
        .eq("customer_id", account.id)
        .order("starts_at", { ascending: false })
        .limit(50),
      supabase
        .from("favorites")
        .select("businesses(slug, name, logo_url, category, district, city)")
        .eq("customer_id", account.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]).then(([a, f]) => {
      setAppts((a.data ?? []) as unknown as Appt[]);
      setFavs(((f.data ?? []) as unknown as { businesses: Fav | null }[]).flatMap((x) => (x.businesses ? [x.businesses] : [])));
    });
  }, [account.id]);

  const iso = now.toISOString();
  const upcoming = (appts ?? []).filter((a) => a.starts_at >= iso && (a.status === "pending" || a.status === "confirmed")).reverse();
  const next = upcoming[0];
  // Tekrar al: geçmişte gidilen her işletmeden en son randevu (en fazla 6).
  const seen = new Set<string>();
  const rebook = (appts ?? []).filter((a) => {
    if (!a.businesses || a.starts_at >= iso || !["completed", "confirmed"].includes(a.status) || seen.has(a.businesses.slug)) return false;
    seen.add(a.businesses.slug);
    return true;
  }).slice(0, 6);
  const firstName = account.name.split(" ")[0];
  const business = account.kind === "business" || account.kind === "admin";

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 pt-2">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Karşılama + arama */}
        <div className="card relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-gold/10 blur-3xl" />
          <p className="relative text-sm text-ink-3">{formatDate(iso, { month: "long" })}</p>
          <h1 className="relative mt-1 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
            {greeting(now.getHours())}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="relative mt-2 text-ink-2">
            {next ? (
              <>
                Sıradaki randevun <strong className="font-semibold text-ink">{untilText(next.starts_at, now.getTime())}</strong>.
              </>
            ) : appts === null ? (
              "Randevuların yükleniyor…"
            ) : (
              "Kendine bir iyilik yap: bugün boş saati olan işletmelere göz at."
            )}
          </p>
          <Form action="/kesfet" className="relative mt-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input name="q" placeholder="Berber, kuaför, işletme adı…" aria-label="İşletme ara" className="input py-3 pl-10" />
            </div>
            <button className="btn btn-primary px-5">Ara</button>
          </Form>
        </div>

        {/* Sıradaki randevu ya da hızlı yollar */}
        {next?.businesses ? (
          <NextCard appt={next} biz={next.businesses} now={now.getTime()} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Quick href="/kesfet?bugun=1" icon={CalendarClock} title="Bugün müsait" text="Boş saati olanlar" tone="brand" />
            <Quick href="/#yakinimda" icon={LocateFixed} title="Yakınımda" text="Konumuna göre" />
            <Quick href="/hesabim" icon={CalendarCheck} title="Randevularım" text={appts ? `${upcoming.length} yaklaşan` : "…"} />
            <Quick href="/hesabim?sekme=favoriler" icon={Heart} title="Favorilerim" text={`${favs.length} işletme`} />
          </div>
        )}
      </div>

      {next && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Quick href="/kesfet?bugun=1" icon={CalendarClock} title="Bugün müsait" text="Boş saati olanlar" tone="brand" />
          <Quick href="/#yakinimda" icon={LocateFixed} title="Yakınımda" text="Konumuna göre" />
          <Quick href="/hesabim" icon={CalendarCheck} title="Randevularım" text={`${upcoming.length} yaklaşan`} />
          <Quick href="/hesabim?sekme=favoriler" icon={Heart} title="Favorilerim" text={`${favs.length} işletme`} />
        </div>
      )}

      {business && (
        <Link
          href={account.kind === "admin" ? "/admin" : "/panel"}
          className="card mt-3 flex items-center gap-3 p-4 transition hover:-translate-y-0.5"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
            <LayoutDashboard className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{account.kind === "admin" ? "Yönetim paneli" : "İşletme panelin"}</span>
            <span className="block text-sm text-ink-3">Randevular, müşteriler ve raporlar</span>
          </span>
          <ArrowRight className="size-4 text-ink-3" />
        </Link>
      )}

      {rebook.length > 0 && (
        <Shelf title="Tekrar al" icon={RotateCcw} text="Gittiğin yerlere tek dokunuşla, aynı hizmet seçili">
          {rebook.map((a) => {
            const q = new URLSearchParams();
            if (a.service_id) q.set("hizmet", a.service_id);
            if (a.staff_id) q.set("personel", a.staff_id);
            return (
              <MiniCard
                key={a.id}
                href={`/${a.businesses!.slug}${q.size ? `?${q}` : ""}#randevu`}
                biz={a.businesses!}
                sub={`${a.service_name} · ${formatDate(a.starts_at, { weekday: undefined })}`}
                cta="Tekrar al"
              />
            );
          })}
        </Shelf>
      )}

      {favs.length > 0 && (
        <Shelf title="Favorilerin" icon={Heart} text="Kalbe dokunduğun işletmeler" more={{ href: "/hesabim?sekme=favoriler", label: "Tümü" }}>
          {favs.map((b) => (
            <MiniCard key={b.slug} href={`/${b.slug}`} biz={b} sub={[categoryLabel(b.category), b.city].filter(Boolean).join(" · ")} cta="Randevu al" />
          ))}
        </Shelf>
      )}

      {recent.length > 0 && (
        <Shelf title="Son baktıkların" icon={Eye} text="Kaldığın yerden devam et">
          {recent.map((b) => (
            <MiniCard key={b.slug} href={`/${b.slug}`} biz={b} sub={[categoryLabel(b.category), b.city].filter(Boolean).join(" · ")} cta="Göz at" />
          ))}
        </Shelf>
      )}

      {appts !== null && rebook.length === 0 && favs.length === 0 && (
        <div className="card mt-6 flex flex-wrap items-center gap-4 p-5">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-400/12 text-accent">
            <Sparkles className="size-5" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            İlk randevunu aldıktan sonra burada <strong className="font-medium text-ink">Tekrar al</strong> ve{" "}
            <strong className="font-medium text-ink">Favorilerin</strong> görünür. Aşağıdan kategorilere göz at.
          </p>
          <Link href="/kesfet" className="btn btn-secondary">
            <Compass className="size-4" /> Keşfet
          </Link>
        </div>
      )}
    </section>
  );
}

function NextCard({ appt, biz, now }: { appt: Appt; biz: Biz; now: number }) {
  const place = [biz.address, biz.district, biz.city].filter(Boolean).join(", ");
  const maps = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${biz.name} ${place}`)}` : null;
  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white shadow-[0_24px_50px_-24px_rgb(13_148_136/0.8)]">
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
      <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
        <CalendarCheck className="size-4" /> Sıradaki randevun · {appt.status === "pending" ? "onay bekliyor" : "onaylandı"}
      </p>
      <div className="relative mt-4 flex items-end gap-4">
        <div>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">{formatTime(appt.starts_at)}</p>
          <p className="mt-1 text-sm text-white/80">
            {formatDate(appt.starts_at)} · {untilText(appt.starts_at, now)}
          </p>
        </div>
      </div>
      <Link href={`/${biz.slug}`} className="relative mt-4 block truncate text-lg font-semibold hover:underline">
        {biz.name}
      </Link>
      <p className="relative truncate text-sm text-white/80">{appt.service_name}</p>
      <div className="relative mt-auto flex flex-wrap gap-2 pt-5">
        {maps && (
          <a href={maps} target="_blank" rel="noreferrer" className="btn bg-white py-2 text-brand-800 hover:bg-white/90">
            <MapPin className="size-4" /> Yol tarifi
          </a>
        )}
        {biz.phone && (
          <a href={`tel:${biz.phone}`} className="btn bg-white/15 py-2 text-white hover:bg-white/25">
            <Phone className="size-4" /> Ara
          </a>
        )}
        <Link href="/hesabim" className="btn bg-white/15 py-2 text-white hover:bg-white/25">
          Yönet
        </Link>
      </div>
    </div>
  );
}

function Quick({ href, icon: Icon, title, text, tone }: { href: string; icon: LucideIcon; title: string; text: string; tone?: "brand" }) {
  return (
    <Link href={href} className="card group flex flex-col justify-between gap-4 p-4 transition duration-300 ease-spring hover:-translate-y-0.5">
      <span className={`grid size-10 place-items-center rounded-xl ${tone === "brand" ? "bg-brand-400 text-brand-950" : "bg-brand-400/12 text-accent"}`}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-ink-3">{text}</span>
      </span>
    </Link>
  );
}

function Shelf({
  title,
  icon: Icon,
  text,
  more,
  children,
}: {
  title: string;
  icon: LucideIcon;
  text: string;
  more?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon className="size-5 text-accent" /> {title}
          </h2>
          <p className="text-sm text-ink-3">{text}</p>
        </div>
        {more && (
          <Link href={more.href} className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            {more.label} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {/* Telefonda yana kayan raf; kartlar yarım görünür ki kaydırılabildiği anlaşılsın. */}
      <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">{children}</ul>
    </div>
  );
}

function MiniCard({ href, biz, sub, cta }: { href: string; biz: Pick<Biz, "name" | "logo_url" | "category">; sub: string; cta: string }) {
  return (
    <li className="w-64 shrink-0 snap-start">
      <Link href={href} className="card group flex h-full items-center gap-3 p-3 transition duration-300 ease-spring hover:-translate-y-0.5">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-400/12 text-accent">
          {biz.logo_url ? <img src={biz.logo_url} alt="" className="size-full object-cover" /> : <CategoryIcon id={biz.category} className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{biz.name}</span>
          <span className="block truncate text-xs text-ink-3">{sub}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
            {cta} <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </span>
      </Link>
    </li>
  );
}
