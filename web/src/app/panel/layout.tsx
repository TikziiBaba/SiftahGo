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
  QrCode,
  Scissors,
  Settings,
  Users,
} from "lucide-react";
import { Logo } from "@/components/site-header";
import { BusinessContext, SetupDoneContext } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { isSubscribed } from "@/lib/constants";
import type { Business } from "@/lib/types";

const NAV = [
  { href: "/panel", label: "Randevular", icon: CalendarDays },
  { href: "/panel/musteriler", label: "Müşteriler", icon: Contact },
  { href: "/panel/raporlar", label: "Raporlar", icon: BarChart3 },
  { href: "/panel/hizmetler", label: "Hizmetler", icon: Scissors },
  { href: "/panel/personel", label: "Personel", icon: Users },
  { href: "/panel/saatler", label: "Saatler", icon: Clock },
  { href: "/panel/ayarlar", label: "Ayarlar", icon: Settings },
  { href: "/panel/qr", label: "QR Kod", icon: QrCode },
  { href: "/panel/abonelik", label: "Abonelik", icon: CreditCard },
];

// Aboneliği olmayan işletmenin açabileceği sayfalar.
const OPEN_WITHOUT_PLAN = ["/panel/abonelik", "/panel/ayarlar"];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);
  // Abonelik durumu veri yüklenirken hesaplanır (render sırasında saat okunmaz).
  const [sub, setSub] = useState({ subscribed: false, daysLeft: 0 });

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return router.replace("/giris?next=/panel");
    const { data } = await supabase.from("businesses").select("*").eq("owner_id", auth.user.id).maybeSingle();
    const b = (data as Business) ?? null;
    setSub({
      subscribed: b ? isSubscribed(b) : false,
      daysLeft: b?.subscription_ends_at ? Math.ceil((new Date(b.subscription_ends_at).getTime() - Date.now()) / 864e5) : 0,
    });
    setBusiness(b);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- işletmeyi ilk açılışta yükle
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (business === null && pathname !== "/panel/kurulum") router.replace("/panel/kurulum");
    if (business && pathname === "/panel/kurulum") router.replace("/panel");
    if (business && !sub.subscribed && !OPEN_WITHOUT_PLAN.includes(pathname)) router.replace("/panel/abonelik");
  }, [business, sub.subscribed, pathname, router]);

  if (pathname === "/panel/kurulum" && business === null) {
    return <SetupDoneContext.Provider value={refresh}>{children}</SetupDoneContext.Provider>;
  }

  const { subscribed, daysLeft } = sub;

  if (!business || pathname === "/panel/kurulum" || (!subscribed && !OPEN_WITHOUT_PLAN.includes(pathname))) {
    return (
      <div className="grid flex-1 place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-ink-3" />
      </div>
    );
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/");
  }

  return (
    <BusinessContext.Provider value={{ business, refresh }}>
      <div className="flex min-h-full flex-1">
        <aside className="sticky top-0 hidden print:hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
          <Logo />
          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  pathname === item.href ? "bg-brand-400/10 text-brand-300" : "text-ink-2 hover:bg-white/5"
                }`}
              >
                <item.icon className="size-4.5" /> {item.label}
              </Link>
            ))}
          </nav>
          <button onClick={logout} className="btn btn-ghost justify-start">
            <LogOut className="size-4" /> Çıkış
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex print:hidden h-16 items-center justify-between gap-3 border-b border-line bg-bg/75 px-4 backdrop-blur-xl md:px-8">
            <p className="truncate font-semibold">{business.name}</p>
            <div className="flex items-center gap-1">
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
          {subscribed && daysLeft <= 5 && pathname !== "/panel/abonelik" && (
            <Link
              href="/panel/abonelik"
              className="flex items-center justify-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 print:hidden"
            >
              Aboneliğinizin bitmesine {daysLeft} gün kaldı. Kesintisiz devam etmek için yenileyin →
            </Link>
          )}
          <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-16 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                pathname === item.href ? "text-brand-300" : "text-ink-3"
              }`}
            >
              <item.icon className="size-5" /> {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </BusinessContext.Provider>
  );
}
