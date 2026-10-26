"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Clock,
  Contact,
  CreditCard,
  ExternalLink,
  Loader2,
  LogOut,
  MoreHorizontal,
  QrCode,
  Scissors,
  Settings,
  Sparkles,
  Star,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { InboxBell } from "@/components/inbox-bell";
import { Logo } from "@/components/site-header";
import { BusinessContext, SetupContext } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { isSubscribed, isTrial } from "@/lib/constants";
import type { Business } from "@/lib/types";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "pending" | "reviews" };

// Menü işe göre gruplu: günlük işler üstte, ayarlar altta.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Günlük",
    items: [
      { href: "/panel", label: "Bugün", icon: CalendarDays, badge: "pending" },
      { href: "/panel/musteriler", label: "Müşteriler", icon: Contact },
      { href: "/panel/yorumlar", label: "Yorumlar", icon: Star, badge: "reviews" },
    ],
  },
  {
    title: "İşletmem",
    items: [
      { href: "/panel/hizmetler", label: "Hizmetler", icon: Scissors },
      { href: "/panel/personel", label: "Personel", icon: Users },
      { href: "/panel/saatler", label: "Çalışma saatleri", icon: Clock },
      { href: "/panel/ayarlar", label: "Ayarlar", icon: Settings },
    ],
  },
  {
    title: "Büyüme",
    items: [
      { href: "/panel/raporlar", label: "Raporlar", icon: BarChart3 },
      { href: "/panel/qr", label: "QR kod", icon: QrCode },
    ],
  },
  { title: "Hesap", items: [{ href: "/panel/abonelik", label: "Abonelik", icon: CreditCard }] },
];
const ALL = GROUPS.flatMap((g) => g.items);
// Telefonda alt çubukta duran dört sekme; kalanlar "Daha fazla" sayfasında.
const PRIMARY = ["/panel", "/panel/musteriler", "/panel/raporlar", "/panel/yorumlar"];

// Aboneliği olmayan işletmenin açabileceği sayfalar.
const OPEN_WITHOUT_PLAN = ["/panel/abonelik", "/panel/ayarlar"];

const PLAN_NAMES: Record<string, string> = { baslangic: "Başlangıç", esnaf: "Esnaf", pro: "Pro" };

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);
  // Abonelik durumu veri yüklenirken hesaplanır (render sırasında saat okunmaz).
  const [sub, setSub] = useState({ subscribed: false, trial: false, daysLeft: 0 });
  const [badges, setBadges] = useState({ pending: 0, reviews: 0 });
  const [more, setMore] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    // Yerel oturum yeterli (Auth sunucusuna ayrıca gidilmez, panel bir tur erken açılır); veriyi RLS korur.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return router.replace("/giris?next=/panel");
    const { data } = await supabase.from("businesses").select("*").eq("owner_id", session.user.id).maybeSingle();
    const b = (data as Business) ?? null;
    setSub({
      subscribed: b ? isSubscribed(b) : false,
      trial: b ? isTrial(b) : false,
      daysLeft: b?.subscription_ends_at ? Math.ceil((new Date(b.subscription_ends_at).getTime() - Date.now()) / 864e5) : 0,
    });
    setBusiness(b);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- işletmeyi ilk açılışta yükle
    refresh();
  }, [refresh]);

  // Menü rozetleri: onay bekleyen yaklaşan randevular ve cevaplanmamış yorumlar. Sayfa değişince tazelenir.
  const businessId = business?.id;
  useEffect(() => {
    if (!businessId) return;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "pending")
        .gte("starts_at", new Date().toISOString()),
      supabase.from("reviews").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("reply", ""),
    ]).then(([p, r]) => setBadges({ pending: p.count ?? 0, reviews: r.count ?? 0 }));
  }, [businessId, pathname]);

  // İşletmesi olmayan ya da başvurusu onaylanmamış hesap yalnızca kurulum (başvuru) sayfasını görür.
  const approved = business?.approval_status === "approved";
  useEffect(() => {
    if (business !== undefined && !approved && pathname !== "/panel/kurulum") router.replace("/panel/kurulum");
    if (approved && pathname === "/panel/kurulum") router.replace("/panel");
    if (approved && !sub.subscribed && !OPEN_WITHOUT_PLAN.includes(pathname)) router.replace("/panel/abonelik");
  }, [business, approved, sub.subscribed, pathname, router]);

  if (pathname === "/panel/kurulum" && business !== undefined && !approved) {
    return <SetupContext.Provider value={{ business, refresh }}>{children}</SetupContext.Provider>;
  }

  const { subscribed, trial, daysLeft } = sub;

  if (!business || !approved || pathname === "/panel/kurulum" || (!subscribed && !OPEN_WITHOUT_PLAN.includes(pathname))) {
    return (
      <div className="grid flex-1 place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-ink-3" />
      </div>
    );
  }

  async function logout() {
    await createClient().auth.signOut();
    // İşletme sahibi çıkınca esnaf ana sayfasına döner.
    router.replace("/esnaf");
  }

  const badgeOf = (item: Item) => (item.badge ? badges[item.badge] : 0);
  const current = ALL.find((i) => i.href === pathname);
  const moreActive = !PRIMARY.includes(pathname);
  // Alt menüde seçili sütun; ana sekmeler dışındaki bölümler "Daha fazla" (5. sütun) sayılır.
  const navIndex = moreActive ? PRIMARY.length : PRIMARY.indexOf(pathname);
  const planName = business.plan_id ? PLAN_NAMES[business.plan_id] ?? business.plan_id : "Paketsiz";

  return (
    <BusinessContext.Provider value={{ business, refresh }}>
      <div className="flex min-h-full flex-1">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/60 p-4 backdrop-blur print:hidden md:flex">
          <Logo href="/panel" />
          <Link
            href={`/${business.slug}`}
            target="_blank"
            className="mt-6 flex items-center gap-3 rounded-2xl bg-tint/[0.03] p-2.5 ring-1 ring-line transition hover:ring-line-strong"
          >
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-300 to-brand-600 text-sm font-bold text-brand-950">
              {business.logo_url ? <img src={business.logo_url} alt="" className="size-full object-cover" /> : business.name.charAt(0).toLocaleUpperCase("tr")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{business.name}</span>
              <span className="flex items-center gap-1 text-2xs text-ink-3">
                <ExternalLink className="size-3" /> Sayfamı gör
              </span>
            </span>
          </Link>
          <nav className="mt-5 flex flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none]">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="px-3 pb-1 text-3xs font-semibold uppercase tracking-[0.18em] text-ink-3">{g.title}</p>
                <div className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const on = pathname === item.href;
                    const n = badgeOf(item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          on ? "bg-brand-400/10 text-accent" : "text-ink-2 hover:bg-tint/5 hover:text-ink"
                        }`}
                      >
                        {on && <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
                        <item.icon className="size-4.5" /> <span className="flex-1">{item.label}</span>
                        {n > 0 && (
                          <span className={`min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums ${item.badge === "pending" ? "bg-amber-400 text-amber-950" : "bg-brand-400/20 text-accent"}`}>
                            {n}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <Link href="/panel/abonelik" className="mt-4 block rounded-2xl bg-gradient-to-br from-brand-400/15 to-gold/10 p-3 ring-1 ring-brand-400/20">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Sparkles className="size-3.5" /> {trial ? "Pro deneme" : `${planName} paketi`}
            </p>
            <p className="mt-0.5 text-2xs text-ink-3">{daysLeft > 0 ? `${daysLeft} gün kaldı` : "Süresi doldu"}</p>
            <div className="mt-2 h-1 rounded-full bg-tint/10">
              <div className="h-1 rounded-full bg-brand-400" style={{ width: `${Math.min(100, Math.max(4, (daysLeft / (trial ? 7 : 30)) * 100))}%` }} />
            </div>
          </Link>
          <button onClick={logout} className="btn btn-ghost mt-2 justify-start">
            <LogOut className="size-4" /> Çıkış
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/75 px-4 backdrop-blur-xl print:hidden md:px-8">
            <div className="min-w-0">
              <p className="truncate text-2xs font-medium uppercase tracking-[0.18em] text-ink-3 md:hidden">{business.name}</p>
              <p className="truncate font-semibold">{current?.label ?? "Panel"}</p>
            </div>
            <div className="flex items-center gap-1">
              <InboxBell />
              <Link href={`/${business.slug}`} target="_blank" className="btn btn-secondary py-2">
                <ExternalLink className="size-4" /> <span className="hidden sm:inline">Sayfamı gör</span>
              </Link>
              <button onClick={logout} className="btn btn-ghost md:hidden" aria-label="Çıkış">
                <LogOut className="size-4" />
              </button>
            </div>
          </header>
          {business.is_suspended && (
            <p className="border-b border-rose-400/20 bg-rose-500/10 px-4 py-2 text-center text-sm text-rose-200 print:hidden">
              İşletmeniz yönetici tarafından yayından kaldırıldı; sayfanız görünmüyor ve randevu alınamıyor. Bilgi için bizimle iletişime geçin.
            </p>
          )}
          {trial && pathname !== "/panel/abonelik" && (
            <Link
              href="/panel/abonelik"
              className="flex items-center justify-center gap-2 border-b border-brand-400/20 bg-brand-400/10 px-4 py-2 text-sm text-accent-strong print:hidden"
            >
              Ücretsiz Pro denemenizin bitmesine {daysLeft} gün kaldı. Sayfanız yayında kalsın diye paket seçin →
            </Link>
          )}
          {subscribed && !trial && daysLeft <= 5 && pathname !== "/panel/abonelik" && (
            <Link
              href="/panel/abonelik"
              className="flex items-center justify-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 print:hidden"
            >
              Aboneliğinizin bitmesine {daysLeft} gün kaldı. Kesintisiz devam etmek için yenileyin →
            </Link>
          )}
          <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
        </div>

        {/* Telefon: dört ana sekme + "Daha fazla" */}
        <nav
          // Sayfa geçişinde menü yerinde durur (globals.css).
          style={{ viewTransitionName: "panel-nav" }}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden md:hidden"
        >
          {/* Seçili sekmenin zemini tek parça; sekme değişince yeni yerine kayar ("Daha fazla" dahil). */}
          <span
            aria-hidden
            className="tab-indicator absolute left-0 top-1 w-1/5 px-2"
            style={{ height: "calc(100% - 0.5rem - env(safe-area-inset-bottom))", translate: `${navIndex * 100}% 0` }}
          >
            <span className="block size-full rounded-xl bg-brand-400/10" />
          </span>
          {PRIMARY.map((href, index) => {
            const item = ALL.find((i) => i.href === href)!;
            const on = pathname === href;
            const n = badgeOf(item);
            return (
              <Link
                key={href}
                href={href}
                // Sağdaki sekmeye geçerken sayfa sola, soldakine geçerken sağa kayar.
                transitionTypes={on ? undefined : [index > navIndex ? "tab-forward" : "tab-back"]}
                aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-3xs font-medium transition-colors duration-300 ${on ? "text-accent" : "text-ink-3"}`}
              >
                <item.icon className={`size-5 ${on ? "tab-pop" : ""}`} />
                {item.label}
                {n > 0 && <span className="absolute right-[22%] top-1 min-w-4 rounded-full bg-amber-400 px-1 text-center text-3xs font-bold text-amber-950">{n}</span>}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMore(true)}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-3xs font-medium transition-colors duration-300 ${moreActive ? "text-accent" : "text-ink-3"}`}
          >
            <MoreHorizontal className={`size-5 ${moreActive ? "tab-pop" : ""}`} />
            Daha fazla
          </button>
        </nav>
        {more && (
          <div className="fixed inset-0 z-40 grid place-items-end bg-black/60 md:hidden" onClick={() => setMore(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] ring-1 ring-line">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Tüm bölümler</p>
                <button type="button" onClick={() => setMore(false)} aria-label="Kapat" className="grid size-9 place-items-center rounded-full ring-1 ring-line">
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {ALL.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMore(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-medium ring-1 ${pathname === item.href ? "bg-brand-400/10 text-accent ring-brand-400/30" : "text-ink-2 ring-line"}`}
                  >
                    <item.icon className="size-5" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </BusinessContext.Provider>
  );
}
