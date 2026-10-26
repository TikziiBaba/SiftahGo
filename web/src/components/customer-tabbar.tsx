"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CalendarCheck, Compass, House, LayoutDashboard, LogIn, UserRound, Zap, type LucideIcon } from "lucide-react";
import { useAccount } from "@/lib/use-account";

type Tab = { href: string; label: string; icon: LucideIcon; active: (path: string, q: URLSearchParams) => boolean };

// Telefonda müşteri sayfalarının altında sabit sekmeler: kullanıcı nerede olduğunu görür, tek dokunuşla döner.
const HIDDEN = ["/giris", "/kayit", "/sifremi-unuttum", "/sifre-yenile"];

function tabsFor(kind: string | undefined): Tab[] {
  const home: Tab = { href: "/", label: "Ana sayfa", icon: House, active: (p) => p === "/" };
  const explore: Tab = { href: "/kesfet", label: "Keşfet", icon: Compass, active: (p, q) => p === "/kesfet" && q.get("bugun") !== "1" };
  if (!kind || kind === "guest") {
    return [
      home,
      explore,
      { href: "/kesfet?bugun=1", label: "Bugün", icon: Zap, active: (p, q) => p === "/kesfet" && q.get("bugun") === "1" },
      { href: "/giris", label: "Giriş", icon: LogIn, active: () => false },
    ];
  }
  const own: Tab =
    kind === "customer" || kind === "user"
      ? { href: "/hesabim?sekme=profil", label: "Profil", icon: UserRound, active: (p, q) => p === "/hesabim" && q.get("sekme") === "profil" }
      : { href: kind === "admin" ? "/admin" : "/panel", label: kind === "admin" ? "Yönetim" : "Panel", icon: LayoutDashboard, active: () => false };
  return [
    home,
    explore,
    { href: "/hesabim", label: "Randevularım", icon: CalendarCheck, active: (p, q) => p === "/hesabim" && q.get("sekme") !== "profil" },
    own,
  ];
}

export function CustomerTabBar() {
  return (
    <Suspense fallback={<div className="h-24 md:hidden" aria-hidden />}>
      <TabBar />
    </Suspense>
  );
}

function TabBar() {
  const path = usePathname();
  const query = useSearchParams();
  const account = useAccount();
  // Cam afişi (/{işletme}/afis) yazdırılacak sayfa; çubuk önizlemeyi örtmesin.
  if (HIDDEN.some((h) => path.startsWith(h)) || path.endsWith("/afis")) return null;
  // Oturum okunana kadar (birkaç yüz ms) yalnızca herkese ortak iki sekme; "Giriş" yanlışlıkla görünmesin.
  const tabs = account ? tabsFor(account.kind) : tabsFor(undefined).slice(0, 2);
  const params = new URLSearchParams(query.toString());
  const current = tabs.findIndex((t) => t.active(path, params));

  return (
    <>
      {/* Sabit çubuk içeriğin son satırını örtmesin. */}
      <div className="h-24 md:hidden" aria-hidden />
      <nav
        aria-label="Hızlı gezinme"
        // Sayfa geçişinde çubuk yerinde durur (globals.css).
        style={{ viewTransitionName: "tabbar" }}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-4 rounded-2xl bg-surface/90 p-1.5 shadow-[0_12px_40px_-12px_rgb(15_26_25/0.35)] ring-1 ring-line-strong backdrop-blur-xl md:hidden"
      >
        {/* Seçili sekmenin zemini tek parça; sekme değişince yeni yerine kayar. */}
        <span
          aria-hidden
          className="tab-indicator absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/4)] rounded-xl bg-brand-400/12"
          style={{ translate: `${Math.max(current, 0) * 100}% 0`, opacity: current < 0 ? 0 : 1 }}
        />
        {tabs.map((t, i) => {
          const on = i === current;
          return (
            <Link
              key={t.label}
              href={t.href}
              // Sağdaki sekmeye geçerken sayfa sola, soldakine geçerken sağa kayar.
              transitionTypes={current < 0 || on ? undefined : [i > current ? "tab-forward" : "tab-back"]}
              aria-current={on ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 rounded-xl py-2 text-3xs font-medium transition-colors duration-300 ${
                on ? "text-accent" : "text-ink-3 active:bg-tint/[0.05]"
              }`}
            >
              <t.icon className={`size-5 ${on ? "tab-pop" : ""}`} style={{ strokeWidth: on ? 2 : 1.5 }} />
              {t.label}
            </Link>
          );
        })}
        {tabs.length < 4 && Array.from({ length: 4 - tabs.length }, (_, i) => <span key={i} aria-hidden className="m-2 rounded-xl bg-tint/[0.04]" />)}
      </nav>
    </>
  );
}
