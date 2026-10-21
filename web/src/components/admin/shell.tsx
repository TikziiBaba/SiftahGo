"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bug,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquareText,
  MoreHorizontal,
  Package,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { CommandPalette } from "@/components/admin/command";
import { Logo } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "errors" | "applications" };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Genel",
    items: [
      { href: "/admin", label: "Genel Bakış", icon: LayoutDashboard },
      { href: "/admin/analitik", label: "Analitik", icon: BarChart3 },
    ],
  },
  {
    title: "Kayıtlar",
    items: [
      { href: "/admin/basvurular", label: "Başvurular", icon: ClipboardCheck, badge: "applications" },
      { href: "/admin/isletmeler", label: "İşletmeler", icon: Store },
      { href: "/admin/kullanicilar", label: "Kullanıcılar", icon: Users },
      { href: "/admin/randevular", label: "Randevular", icon: CalendarDays },
      { href: "/admin/odemeler", label: "Ödemeler", icon: CreditCard },
      { href: "/admin/yorumlar", label: "Yorumlar", icon: MessageSquareText },
    ],
  },
  { title: "Ayarlar", items: [{ href: "/admin/paketler", label: "Paketler", icon: Package }] },
  {
    title: "Sistem",
    items: [
      { href: "/admin/sistem", label: "Sistem durumu", icon: Activity },
      { href: "/admin/hatalar", label: "Hatalar", icon: Bug, badge: "errors" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);
const PRIMARY = ["/admin", "/admin/analitik", "/admin/isletmeler", "/admin/kullanicilar"];

const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

/** Yönetici paneli çerçevesi. Yetki kontrolü veritabanında (is_admin); burası sadece yönlendirir. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{ email: string; admin: boolean } | null>(null);
  const [errors, setErrors] = useState(0);
  const [applications, setApplications] = useState(0);
  const [search, setSearch] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Yerel oturum yeterli (Auth sunucusuna ayrıca gidilmez); yetkiyi is_admin ve RLS denetler.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return router.replace(`/giris?next=${encodeURIComponent(pathname)}`);
      const { data: admin } = await supabase.rpc("is_admin");
      setState({ email: session.user.email ?? "", admin: admin === true });
    });
    // Sadece ilk açılışta kontrol edilir; sayfa değişiminde tekrar gerekmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Çözülmemiş hata ve onay bekleyen başvuru sayısı (menü rozetleri); sayfa değişince tazelenir.
  const isAdmin = state?.admin === true;
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = createClient();
    supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .then(({ count }) => setErrors(count ?? 0));
    supabase
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending")
      .then(({ count }) => setApplications(count ?? 0));
  }, [isAdmin, pathname]);

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
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-400/10 text-bad">
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

  const current = ALL.find((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/60 p-4 backdrop-blur md:flex">
        <div className="flex items-center justify-between">
          <Logo href="/admin" />
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.18em] text-gold ring-1 ring-gold/20">
            <ShieldCheck className="size-3" /> Yönetim
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSearch(true)}
          className="mt-5 flex items-center gap-2 rounded-xl bg-tint/[0.03] px-3 py-2 text-sm text-ink-3 ring-1 ring-line transition hover:text-ink hover:ring-line-strong"
        >
          <Search className="size-4" /> <span className="flex-1 text-left">Ara…</span>
          <kbd className="rounded px-1 text-2xs ring-1 ring-line">Ctrl K</kbd>
        </button>
        <nav className="mt-5 flex flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none]">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="px-3 pb-1 text-3xs font-semibold uppercase tracking-[0.18em] text-ink-3">{g.title}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const on = isActive(pathname, item.href);
                  const n = item.badge === "errors" ? errors : item.badge === "applications" ? applications : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={on ? "page" : undefined}
                      className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${on ? "bg-brand-400/10 text-accent" : "text-ink-2 hover:bg-tint/5 hover:text-ink"}`}
                    >
                      {on && <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
                      <item.icon className="size-4.5" /> <span className="flex-1">{item.label}</span>
                      {n > 0 && (
                        <span
                          className={`min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums ${item.badge === "applications" ? "bg-amber-400 text-amber-950" : "bg-rose-500 text-white"}`}
                        >
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
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-tint/[0.03] p-2.5 ring-1 ring-line">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold">{state.email.charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={state.email}>
            {state.email}
          </span>
          <button onClick={logout} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-tint/5 hover:text-ink" aria-label="Çıkış" title="Çıkış">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/75 px-4 backdrop-blur-xl md:px-8">
          <p className="truncate text-sm font-semibold">
            <span className="text-ink-3 max-md:hidden">Yönetim / </span>
            {current?.label ?? "Yönetim"}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSearch(true)} className="btn btn-ghost px-3 md:hidden" aria-label="Ara">
              <Search className="size-4" />
            </button>
            <Link href="/" className="btn btn-ghost py-2 text-xs max-sm:hidden">
              Siteye git
            </Link>
            <button onClick={logout} className="btn btn-ghost md:hidden" aria-label="Çıkış">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {PRIMARY.map((href) => {
          const item = ALL.find((i) => i.href === href)!;
          const on = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2 text-3xs font-medium ${on ? "text-accent" : "text-ink-3"}`}>
              <item.icon className="size-5" /> {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore(true)} className="relative flex flex-col items-center gap-0.5 py-2 text-3xs font-medium text-ink-3">
          <MoreHorizontal className="size-5" /> Daha fazla
          {(errors > 0 || applications > 0) && (
            <span className={`absolute right-[22%] top-1 size-2 rounded-full ${applications > 0 ? "bg-amber-400" : "bg-rose-500"}`} />
          )}
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
                  className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-medium ring-1 ${isActive(pathname, item.href) ? "bg-brand-400/10 text-accent ring-brand-400/30" : "text-ink-2 ring-line"}`}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <CommandPalette pages={ALL} open={search} setOpen={setSearch} />
    </div>
  );
}
