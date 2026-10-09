"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { Logo } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/admin", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/admin/isletmeler", label: "İşletmeler", icon: Store },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", icon: Users },
  { href: "/admin/odemeler", label: "Ödemeler", icon: CreditCard },
  { href: "/admin/randevular", label: "Randevular", icon: CalendarDays },
  { href: "/admin/paketler", label: "Paketler", icon: Package },
];

const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

/** Yönetici paneli çerçevesi. Yetki kontrolü veritabanında (is_admin); burası sadece yönlendirir. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{ email: string; admin: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace(`/giris?next=${encodeURIComponent(pathname)}`);
      const { data: admin } = await supabase.rpc("is_admin");
      setState({ email: data.user.email ?? "", admin: admin === true });
    });
    // Sadece ilk açılışta kontrol edilir; sayfa değişiminde tekrar gerekmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/");
  }

  if (!state) {
    return (
      <div className="grid flex-1 place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-ink-3" />
      </div>
    );
  }

  if (!state.admin) {
    return (
      <div className="grid flex-1 place-items-center px-4 py-24">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-400/10 text-rose-300">
            <ShieldAlert className="size-5" />
          </span>
          <h1 className="mt-5 text-xl font-semibold">Bu sayfaya erişiminiz yok</h1>
          <p className="mt-2 text-sm text-ink-3">Yönetim paneli sadece site yöneticileri içindir.</p>
          <Link href="/" className="btn btn-secondary mt-6">
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <Logo />
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-gold ring-1 ring-gold/20">
          <ShieldCheck className="size-3.5" /> Yönetim
        </p>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive(pathname, item.href) ? "bg-brand-400/10 text-brand-300" : "text-ink-2 hover:bg-white/5"
              }`}
            >
              <item.icon className="size-4.5" /> {item.label}
            </Link>
          ))}
        </nav>
        <p className="truncate px-3 pb-2 text-xs text-ink-4" title={state.email}>
          {state.email}
        </p>
        <button onClick={logout} className="btn btn-ghost justify-start">
          <LogOut className="size-4" /> Çıkış
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/75 px-4 backdrop-blur-xl md:hidden">
          <Logo />
          <button onClick={logout} className="btn btn-ghost" aria-label="Çıkış">
            <LogOut className="size-4" />
          </button>
        </header>
        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-16 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              isActive(pathname, item.href) ? "text-brand-300" : "text-ink-3"
            }`}
          >
            <item.icon className="size-5" /> {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
