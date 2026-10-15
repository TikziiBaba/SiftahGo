"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarCheck, CalendarSearch, ShieldCheck, Store } from "lucide-react";
import { InboxBell } from "@/components/inbox-bell";
import { createClient } from "@/lib/supabase/client";
import { COMPANY, LEGAL_DOCS } from "@/lib/company";
import { SITE_NAME } from "@/lib/constants";

export function Logo({ size = "md", href = "/" }: { size?: "md" | "lg"; href?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 font-semibold tracking-tight text-ink ${size === "lg" ? "text-2xl" : "text-lg"}`}>
      <span
        className={`relative grid place-items-center rounded-xl bg-gradient-to-br from-brand-300 via-brand-500 to-brand-800 text-brand-950 shadow-[inset_0_1px_1px_rgb(255_255_255/0.5),0_6px_20px_-6px_rgb(45_212_191/0.6)] ${size === "lg" ? "size-11" : "size-8"}`}
      >
        <CalendarCheck className={size === "lg" ? "size-5.5" : "size-4.5"} style={{ strokeWidth: 2 }} />
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-gold shadow-[0_0_10px_rgb(245_181_68/0.9)]" />
      </span>
      {SITE_NAME}
    </Link>
  );
}

// Site iki bölüm: müşteriler (/) ve işletme sahipleri (/esnaf). `other`: öbür bölüme geçiş bağlantısı.
const SECTIONS = {
  musteri: {
    home: "/",
    links: [
      { href: "/#kategoriler", label: "Kategoriler" },
      { href: "/kesfet?bugun=1", label: "Bugün Müsait" },
      { href: "/#nasil", label: "Nasıl Çalışır" },
      { href: "/#uygulama", label: "Uygulama" },
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

/**
 * `section`: menü ve "Hemen Başla" düğmesi hangi bölüme göre (varsayılan müşteri).
 * `minimal`: dükkân sayfalarında pazarlama menüsü ve "Hemen Başla" gizlenir; müşteri işletmeye odaklanır.
 */
export function SiteHeader({ section = "musteri", minimal = false }: { section?: keyof typeof SECTIONS; minimal?: boolean }) {
  const { home, links, other, cta: sectionCta } = SECTIONS[section];
  const [account, setAccount] = useState<{ href: string; label: string; short?: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function load(userId: string | undefined) {
      if (!userId) return setAccount(null);
      const [{ data }, { data: admin }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.rpc("is_admin"),
      ]);
      if (admin === true) return setAccount({ href: "/admin", label: "Yönetim" });
      setAccount(data?.role === "business" ? { href: "/panel", label: "İşletme Paneli", short: "Panel" } : { href: "/hesabim", label: "Hesabım" });
    }
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => load(session?.user.id));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const cta: { href: string; label: string; short?: string } = account ?? sectionCta;

  return (
    <>
      {/* Sabit menü akışta yer kaplamadığı için boşluk bırakılır. */}
      <div className="h-24" aria-hidden />
      <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <div className="flex w-full max-w-5xl items-center justify-between gap-2 rounded-full bg-surface/70 py-2 pl-4 pr-2 ring-1 ring-line-strong backdrop-blur-xl shadow-[0_10px_40px_-12px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.06)]">
          <Logo href={home} />
          <nav className={`hidden items-center gap-1 text-sm ${minimal ? "" : "lg:flex"}`}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-ink-2 transition-colors duration-300 ease-spring hover:bg-white/[0.05] hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            {/* Öbür bölüme geçiş; giriş yapmışken telefonda yalnızca menüde. */}
            {!minimal && (
              <Link
                href={other.href}
                className={`btn whitespace-nowrap py-2 text-gold hover:bg-gold/10 max-sm:px-2 max-sm:text-[13px] ${account ? "hidden sm:inline-flex" : ""}`}
              >
                {/* 360 px telefonda logo ve menü düğmesiyle sığsın diye ikon gizlenir. */}
                <other.icon className="size-4 max-sm:hidden" /> {other.label}
              </Link>
            )}
            {!account && (
              <Link href="/giris" className={`btn ${minimal ? "btn-secondary py-2" : "btn-ghost hidden sm:inline-flex"}`}>
                Giriş
              </Link>
            )}
            {account && <InboxBell />}
            {minimal && account && (
              <Link href={account.href} className="btn btn-secondary py-2">
                {account.label}
              </Link>
            )}
            {/* Giriş yapmış kullanıcı paneline telefonda da tek dokunuşla gider; "Hemen Başla" telefonda menüde kalır. */}
            <Link href={cta.href} className={`group btn btn-primary whitespace-nowrap py-2 pl-4 pr-1.5 max-sm:px-3 ${minimal ? "hidden" : account ? "" : "hidden sm:inline-flex"}`}>
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
          {[...links, other, account ?? { href: "/giris", label: "Giriş" }, ...(account ? [] : [cta])].map((l, i) => (
            <Link
              key={l.href}
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
    </>
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
                <a href={`tel:+90${COMPANY.phone.replace(/\D/g, "").replace(/^0/, "")}`} className="font-mono text-brand-300 hover:text-brand-200">
                  {COMPANY.phone}
                </a>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-ink">E-posta:</dt>
              <dd>
                <a href={`mailto:${COMPANY.email}`} className="break-all text-brand-300 hover:text-brand-200">{COMPANY.email}</a>
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
        <FooterCol title="Gizlilik & Güven" links={LEGAL_DOCS.map((d): [string, string] => [d.label, d.href])} />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-8">
        <p className="select-none bg-gradient-to-b from-white/[0.07] to-transparent bg-clip-text text-[18vw] font-bold leading-none tracking-tighter text-transparent md:text-[11rem]">
          {SITE_NAME}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-ink-3">
          <p>
            © 2026 {SITE_NAME} · {COMPANY.name}. Tüm hakları saklıdır.
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4 text-brand-300" /> PayTR ile güvenli ödeme
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

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
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
      </ul>
    </div>
  );
}
