"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowUpRight, CalendarSearch, ShieldCheck, Store } from "lucide-react";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { InboxBell } from "@/components/inbox-bell";
import { Wordmark } from "@/components/wordmark";
import { accountHome, useAccount } from "@/lib/use-account";
import { COMPANY, LEGAL_DOCS } from "@/lib/company";
import { SITE_NAME } from "@/lib/constants";

export function Logo({ size = "md", href = "/" }: { size?: "md" | "lg"; href?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center">
      <Wordmark className={`w-auto ${size === "lg" ? "h-9" : "h-6.5"}`} />
    </Link>
  );
}

// Site iki bölüm: müşteriler (/) ve işletme sahipleri (/esnaf). `other`: öbür bölüme geçiş bağlantısı.
const SECTIONS = {
  musteri: {
    home: "/",
    links: [
      { href: "/kesfet", label: "Keşfet" },
      { href: "/kesfet?bugun=1", label: "Bugün Müsait" },
      { href: "/#kategoriler", label: "Kategoriler" },
      { href: "/#nasil", label: "Nasıl Çalışır" },
    ],
    other: { href: "/esnaf", label: "İşletmeniz mi var?", icon: Store },
    cta: { href: "/kesfet", label: "Randevu Al" },
  },
  esnaf: {
    home: "/esnaf",
    links: [
      { href: "/esnaf#ozellikler", label: "Özellikler" },
      { href: "/esnaf#nasil", label: "Nasıl Çalışır" },
      { href: "/esnaf#fiyatlar", label: "Fiyatlar" },
      { href: "/esnaf#sss", label: "SSS" },
    ],
    other: { href: "/", label: "Randevu al", icon: CalendarSearch },
    cta: { href: "/kayit?rol=isletme", label: "Hemen Başla" },
  },
};

// Giriş yapmış müşterinin menüsü: pazarlama bölümleri yerine kendi işleri.
const MEMBER_LINKS = [
  { href: "/kesfet", label: "Keşfet" },
  { href: "/kesfet?bugun=1", label: "Bugün Müsait" },
  { href: "/hesabim", label: "Randevularım" },
  { href: "/hesabim?sekme=favoriler", label: "Favorilerim" },
];

type NavLink = { href: string; label: string };

/** Bağlantı şu anki sayfa mı (sorgu dahil; "#" bölümleri sayfa sayılmaz). */
function isActive(href: string, path: string, query: URLSearchParams) {
  if (href.includes("#")) return false;
  const url = new URL(href, "https://x");
  if (url.pathname !== path) return false;
  const want = [...url.searchParams];
  if (want.length === 0) return !query.has("bugun") && !query.has("sekme");
  return want.every(([k, v]) => query.get(k) === v);
}

function NavLinks({ links, active }: { links: NavLink[]; active?: (href: string) => boolean }) {
  return links.map((l) => {
    const on = active?.(l.href) ?? false;
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={on ? "page" : undefined}
        className={`rounded-full px-3.5 py-2 transition-colors duration-300 ease-spring ${
          on ? "bg-brand-400/12 text-accent" : "text-ink-2 hover:bg-tint/[0.05] hover:text-ink"
        }`}
      >
        {l.label}
      </Link>
    );
  });
}

// Aktif sayfa adres çubuğundan okunur; dinamik adreslerde (işletme sayfası) önceden hazırlanırken askıya alınır.
function ActiveNavLinks({ links }: { links: NavLink[] }) {
  const path = usePathname();
  const query = useSearchParams();
  return <NavLinks links={links} active={(href) => isActive(href, path, new URLSearchParams(query.toString()))} />;
}

/**
 * `section`: menü ve "Hemen Başla" düğmesi hangi bölüme göre (varsayılan müşteri).
 * `minimal`: dükkân sayfalarında pazarlama menüsü ve "Hemen Başla" gizlenir; müşteri işletmeye odaklanır.
 */
export function SiteHeader({ section = "musteri", minimal = false }: { section?: keyof typeof SECTIONS; minimal?: boolean }) {
  const { home, links: sectionLinks, other, cta: sectionCta } = SECTIONS[section];
  const account = useAccount();
  const mine = accountHome(account);
  const [open, setOpen] = useState(false);
  const member = section === "musteri" && account?.kind === "customer";
  const links = member ? MEMBER_LINKS : sectionLinks;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const cta: { href: string; label: string; short?: string } = mine ?? sectionCta;

  return (
    // Sarmalayıcı: sayfa geçişinde React kendi adını en üstteki öğelere verir; menü onlardan biri olsaydı kendi
    // adı (site-header) ezilir ve içerikle birlikte kayardı.
    <div>
      {/* Sabit menü akışta yer kaplamadığı için boşluk bırakılır. */}
      <div className="h-24" aria-hidden />
      {/* Sayfa geçişinde menü yerinde durur, içerik altından kayar (globals.css). */}
      <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4" style={{ viewTransitionName: "site-header" }}>
        <div className="flex w-full max-w-5xl items-center justify-between gap-2 rounded-full bg-surface/80 py-2 pl-4 pr-2 ring-1 ring-line-strong backdrop-blur-xl shadow-[0_10px_40px_-12px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.06)]">
          <Logo href={home} />
          <nav className={`hidden items-center gap-1 text-sm ${minimal ? "" : "lg:flex"}`}>
            <Suspense fallback={<NavLinks links={links} />}>
              <ActiveNavLinks links={links} />
            </Suspense>
          </nav>
          <div className="flex items-center gap-1">
            {/* Öbür bölüme geçiş; giriş yapmışken telefonda yalnızca menüde. Üyeye gösterilmez. */}
            {!minimal && !member && (
              <Link
                href={other.href}
                className={`btn whitespace-nowrap py-2 text-gold hover:bg-gold/10 max-sm:px-2 max-sm:text-xs ${mine ? "hidden sm:inline-flex" : ""}`}
              >
                {/* 360 px telefonda logo ve menü düğmesiyle sığsın diye ikon gizlenir. */}
                <other.icon className="size-4 max-sm:hidden" /> {other.label}
              </Link>
            )}
            {account?.kind === "guest" && (
              <Link href="/giris" className={`btn ${minimal ? "btn-secondary py-2" : "btn-ghost hidden sm:inline-flex"}`}>
                Giriş
              </Link>
            )}
            {mine && <InboxBell />}
            {minimal && mine && (
              <Link href={mine.href} className="btn btn-secondary py-2">
                {mine.label}
              </Link>
            )}
            {/* Giriş yapmış kullanıcı paneline telefonda da tek dokunuşla gider; "Hemen Başla" telefonda menüde kalır. */}
            <Link href={cta.href} className={`group btn btn-primary whitespace-nowrap py-2 pl-4 pr-1.5 max-sm:px-3 ${minimal ? "hidden" : mine ? "" : "hidden sm:inline-flex"}`}>
              {/* 360 px telefonda uzun ad başlığı taşırıyor. */}
              {"short" in cta && cta.short ? (
                <>
                  <span className="max-sm:hidden">{cta.label}</span>
                  <span className="sm:hidden">{cta.short}</span>
                </>
              ) : (
                cta.label
              )}
              <span className="btn-icon max-sm:hidden">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
              aria-expanded={open}
              className={`relative grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-line-strong lg:hidden ${minimal ? "hidden" : ""}`}
            >
              <span className={`absolute h-px w-4 bg-ink transition-transform duration-500 ease-spring ${open ? "rotate-45" : "-translate-y-1"}`} />
              <span className={`absolute h-px w-4 bg-ink transition-transform duration-500 ease-spring ${open ? "-rotate-45" : "translate-y-1"}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobil tam ekran menü */}
      <div
        className={`fixed inset-0 z-30 bg-bg/90 backdrop-blur-3xl transition-opacity duration-500 ease-spring lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <nav className="flex h-full flex-col justify-center gap-2 px-8">
          {[...links, ...(member ? [] : [other]), mine ?? { href: "/giris", label: "Giriş" }, ...(mine ? [] : [cta])].map((l, i) => (
            <Link
              key={`${l.href}|${l.label}`}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`text-4xl font-semibold tracking-tight transition-[transform,opacity] duration-700 ease-spring ${l === other ? "text-gold" : "text-ink"} ${open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
              style={{ transitionDelay: open ? `${100 + i * 60}ms` : "0ms" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-line">
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-3">
            Berberden halı sahaya, yakınınızdaki esnaftan online randevu. Müşteri saatini seçer, esnaf işine bakar.
          </p>
          <dl className="mt-6 space-y-2 border-t border-line pt-6 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-ink">Adres:</dt>
              <dd className="text-ink-3">{COMPANY.address}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-ink">Destek hattı:</dt>
              <dd>
                <a href={`tel:+90${COMPANY.phone.replace(/\D/g, "").replace(/^0/, "")}`} className="font-mono text-accent hover:text-accent-strong">
                  {COMPANY.phone}
                </a>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-ink">E-posta:</dt>
              <dd>
                <a href={`mailto:${COMPANY.email}`} className="break-all text-accent hover:text-accent-strong">{COMPANY.email}</a>
              </dd>
            </div>
          </dl>
        </div>
        <FooterCol
          title="Müşteri"
          links={[
            ["İşletme bul", "/kesfet"],
            ["Randevularım", "/hesabim"],
            ["Mobil uygulama", "/#uygulama"],
            ["Hesap aç", "/kayit"],
          ]}
        />
        <FooterCol
          title="İşletme"
          links={[
            ["İşletmeler için", "/esnaf"],
            ["İşletmeni ekle", "/kayit?rol=isletme"],
            ["Panele giriş", "/giris?next=/panel"],
            ["Özellikler", "/esnaf#ozellikler"],
            ["Fiyatlar", "/esnaf#fiyatlar"],
          ]}
        />
        <FooterCol
          title="Destek"
          links={[
            ["Sık sorulanlar", "/esnaf#sss"],
            ["Şifremi unuttum", "/sifremi-unuttum"],
          ]}
        />
        <FooterCol title="Gizlilik & Güven" links={LEGAL_DOCS.map((d): [string, string] => [d.label, d.href])}>
          <li>
            <CookieSettingsButton className="text-ink-2 transition-colors duration-300 hover:text-ink" />
          </li>
        </FooterCol>
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-8">
        <p className="select-none bg-gradient-to-b from-tint/[0.07] to-transparent bg-clip-text text-[18vw] font-bold leading-none tracking-tighter text-transparent md:text-watermark">
          {SITE_NAME}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-ink-3">
          <p>
            © 2026 {SITE_NAME} · {COMPANY.name}. Tüm hakları saklıdır.
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4 text-accent" /> PayTR ile güvenli ödeme
            {["VISA", "Mastercard", "troy"].map((card) => (
              <span key={card} className="rounded-md px-2 py-0.5 font-semibold tracking-wide text-ink-2 ring-1 ring-line">
                {card}
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links, children }: { title: string; links: [string, string][]; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-3">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-ink-2 transition-colors duration-300 hover:text-ink">
              {label}
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </div>
  );
}
