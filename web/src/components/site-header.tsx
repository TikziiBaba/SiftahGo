"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SITE_NAME } from "@/lib/constants";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-stone-900">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white">
        <CalendarCheck className="size-4.5" />
      </span>
      {SITE_NAME}
    </Link>
  );
}

export function SiteHeader() {
  const [account, setAccount] = useState<{ href: string; label: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load(userId: string | undefined) {
      if (!userId) return setAccount(null);
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      setAccount(data?.role === "business" ? { href: "/panel", label: "İşletme Paneli" } : { href: "/hesabim", label: "Hesabım" });
    }
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => load(session?.user.id));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/kesfet" className="btn btn-ghost hidden sm:inline-flex">
            İşletme Bul
          </Link>
          {account ? (
            <Link href={account.href} className="btn btn-primary">
              {account.label}
            </Link>
          ) : (
            <>
              <Link href="/giris" className="btn btn-ghost">
                Giriş
              </Link>
              <Link href="/kayit?rol=isletme" className="btn btn-primary">
                Ücretsiz Başla
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-stone-500 sm:flex-row">
        <Logo />
        <div className="flex gap-5">
          <Link href="/kesfet" className="hover:text-stone-800">İşletme Bul</Link>
          <Link href="/kayit?rol=isletme" className="hover:text-stone-800">İşletmeni Ekle</Link>
          <Link href="/giris" className="hover:text-stone-800">Giriş</Link>
        </div>
        <p>© {SITE_NAME}</p>
      </div>
    </footer>
  );
}
