"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SITE_NAME } from "@/lib/constants";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 font-semibold tracking-tight text-ink ${size === "lg" ? "text-2xl" : "text-lg"}`}>
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

const LINKS = [
  { href: "/kesfet", label: "İşletme Bul" },
  { href: "/#ozellikler", label: "Özellikler" },
  { href: "/#nasil", label: "Nasıl Çalışır" },
  { href: "/#fiyatlar", label: "Fiyatlar" },
  { href: "/#sss", label: "SSS" },
];

export function SiteHeader() {
  const [account, setAccount] = useState<{ href: string; label: string } | null>(null);
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
      setAccount(data?.role === "business" ? { href: "/panel", label: "Panel" } : { href: "/hesabim", label: "Hesabım" });
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

  const cta = account ?? { href: "/kayit?rol=isletme", label: "Hemen Başla" };

  return (
    <>
      {/* Sabit menü akışta yer kaplamadığı için boşluk bırakılır. */}
      <div className="h-24" aria-hidden />
      <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <div className="flex w-full max-w-5xl items-center justify-between gap-2 rounded-full bg-surface/70 py-2 pl-4 pr-2 ring-1 ring-line-strong backdrop-blur-xl shadow-[0_10px_40px_-12px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.06)]">
          <Logo />
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-ink-2 transition-colors duration-300 ease-spring hover:bg-white/[0.05] hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            {!account && (
              <Link href="/giris" className="btn btn-ghost hidden sm:inline-flex">
                Giriş
              </Link>
            )}
            <Link href={cta.href} className="group btn btn-primary hidden py-2 pl-4 pr-1.5 sm:inline-flex">
              {cta.label}
              <span className="btn-icon">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
              aria-expanded={open}
              className="relative grid size-10 place-items-center rounded-full ring-1 ring-line-strong md:hidden"
            >
              <span className={`absolute h-px w-4 bg-ink transition-transform duration-500 ease-spring ${open ? "rotate-45" : "-translate-y-1"}`} />
              <span className={`absolute h-px w-4 bg-ink transition-transform duration-500 ease-spring ${open ? "-rotate-45" : "translate-y-1"}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobil tam ekran menü */}
      <div
        className={`fixed inset-0 z-30 bg-bg/90 backdrop-blur-3xl transition-opacity duration-500 ease-spring md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <nav className="flex h-full flex-col justify-center gap-2 px-8">
          {[...LINKS, account ?? { href: "/giris", label: "Giriş" }, ...(account ? [] : [cta])].map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`text-4xl font-semibold tracking-tight text-ink transition-[transform,opacity] duration-700 ease-spring ${open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
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
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-3">
            Berberden halı sahaya, esnafın randevu defteri. Müşteri bağlantıdan randevu alır, siz işinize bakarsınız.
          </p>
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
            ["İşletmeni ekle", "/kayit?rol=isletme"],
            ["Panele giriş", "/giris?next=/panel"],
            ["Özellikler", "/#ozellikler"],
          ]}
        />
        <FooterCol
          title="Destek"
          links={[
            ["Sık sorulanlar", "/#sss"],
            ["Şifremi unuttum", "/sifremi-unuttum"],
          ]}
        />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-8">
        <p className="select-none bg-gradient-to-b from-white/[0.07] to-transparent bg-clip-text text-[18vw] font-bold leading-none tracking-tighter text-transparent md:text-[11rem]">
          {SITE_NAME}
        </p>
        <p className="mt-4 text-xs text-ink-4">© {SITE_NAME} · Esnaf için online randevu</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-4">{title}</p>
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
