"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { formatCouponWhen, formatDiscount } from "@/lib/coupons";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { MyCoupon } from "@/lib/types";

const STATE: Record<MyCoupon["state"], string> = {
  active: "Kullanılabilir",
  attached: "Randevuya bağlı",
  used: "Kullanıldı",
  expired: "Süresi doldu",
  unavailable: "Şu an kullanılamıyor",
};

/** Hesabım'da müşterinin aldığı kuponlar ve kodları. */
export function MyCoupons() {
  const [list, setList] = useState<MyCoupon[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .rpc("my_coupons")
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        setList((data ?? []) as MyCoupon[]);
      });
  }, []);

  if (list === null) return <div className="card h-28 animate-pulse" />;
  if (error) return <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>;
  if (list.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Ticket className="mx-auto size-8 text-ink-3" />
        <p className="mt-3 font-semibold">Henüz kuponun yok</p>
        <p className="mt-1 text-sm text-ink-3">İşletme sayfalarındaki “Kuponu al” düğmesiyle kupon alabilirsin.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {list.map((c) => (
        <li key={c.claim_id} className={`card flex flex-wrap items-center gap-4 p-4 ${c.state !== "active" && c.state !== "attached" ? "opacity-60" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{c.title}</p>
            <Link href={`/${c.business_slug}`} className="text-sm text-ink-2 hover:underline">
              {c.business_name}
            </Link>
            <p className="text-sm font-medium text-accent">{formatDiscount(c)}</p>
            <p className="text-sm text-ink-3">{formatCouponWhen(c)}</p>
          </div>
          <div className="text-right">
            <p className="rounded-lg bg-brand-400/10 px-3 py-1.5 text-lg font-bold tabular-nums tracking-widest text-accent">{c.code}</p>
            <p className="mt-1 text-xs text-ink-3">{STATE[c.state]}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
