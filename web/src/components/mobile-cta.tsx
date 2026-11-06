"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useAccount } from "@/lib/use-account";

/**
 * Telefonda esnaf sayfasının altında sabit kayıt butonu: üst başlıktaki buton dar ekranda gizli olduğu için.
 * Yalnızca ziyaretçiye; giriş yapmış kullanıcı başlıktaki kendi bağlantısını görür. Çerez bandı bunun üstünde durur.
 */
export function MobileCta({ href, label }: { href: string; label: string }) {
  const account = useAccount();
  if (account?.kind !== "guest") return null;
  return (
    <>
      <div className="h-24 sm:hidden" aria-hidden />
      <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 print:hidden sm:hidden">
        <Link
          href={href}
          className="group btn btn-primary w-full justify-between py-2 pl-6 pr-2 text-base shadow-[0_12px_40px_-12px_rgb(0_0_0/0.6)]"
        >
          {label}
          <span className="btn-icon size-9">
            <ArrowUpRight className="size-4.5" />
          </span>
        </Link>
      </div>
    </>
  );
}
