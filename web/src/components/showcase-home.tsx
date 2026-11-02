"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Copy, Ticket, TicketCheck, TicketPercent } from "lucide-react";
import { KpiCard } from "@/components/charts";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { isSubscribed, isTrial } from "@/lib/constants";
import { formatDate, formatTime, todayStr } from "@/lib/format";
import { useAccount } from "@/lib/use-account";
import type { Coupon } from "@/lib/types";

type Use = { id: string; redeemed_at: string; coupons: { title: string } | null };

/** Vitrin (randevusuz) işletmenin panel ana sayfası: kupon sayıları, son kullanımlar ve kurulum listesi. */
export function ShowcaseHome() {
  const { business } = useBusiness();
  const account = useAccount();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [uses, setUses] = useState<Use[]>([]);
  const [menuCount, setMenuCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.rpc("business_coupons", { p_business_id: business.id }),
      supabase
        .from("coupon_claims")
        .select("id, redeemed_at, coupons(title)")
        .eq("business_id", business.id)
        .not("redeemed_at", "is", null)
        .order("redeemed_at", { ascending: false })
        .limit(5),
      supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("business_id", business.id),
    ]).then(([c, u, m]) => {
      setCoupons((c.data ?? []) as Coupon[]);
      setUses((u.data ?? []) as unknown as Use[]);
      setMenuCount(m.count ?? 0);
    });
  }, [business.id]);

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}/${business.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const today = todayStr();
  const active = (coupons ?? []).filter((c) => c.is_active && c.ends_on >= today).length;
  const claimed = (coupons ?? []).reduce((s, c) => s + c.claimed, 0);
  const used = (coupons ?? []).reduce((s, c) => s + c.used, 0);
  const firstName = account && "name" in account ? account.name.split(" ")[0] : "";

  const checklist = [
    { label: "Adres ekleyin", done: !!business.address.trim(), href: "/panel/ayarlar" },
    { label: "Logo ekleyin", done: !!business.logo_url, href: "/panel/ayarlar" },
    { label: "İlk ürününüzü ekleyin", done: (menuCount ?? 0) > 0, href: "/panel/menu" },
    { label: "İlk kuponunuzu açın", done: (coupons?.length ?? 0) > 0, href: "/panel/kuponlar" },
    { label: "Paketinizi seçin", done: isSubscribed(business) && !isTrial(business), href: "/panel/abonelik" },
  ];
  const left = checklist.filter((c) => !c.done);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-3">{formatDate(today)}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-3xl">{firstName ? `Merhaba, ${firstName}` : "Merhaba"}</h1>
        </div>
        <button className="btn btn-secondary" onClick={copyLink}>
          {copied ? <CheckCircle2 className="size-4 text-ok" /> : <Copy className="size-4" />} {copied ? "Kopyalandı" : "Sayfa linkini kopyala"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <KpiCard label="Açık kupon" icon={TicketPercent} value={coupons ? String(active) : "–"} hint="şu an alınabilir" />
        <KpiCard label="Alınan" icon={Ticket} value={coupons ? String(claimed) : "–"} hint="tüm kuponlar" />
        <KpiCard label="Kullanılan" icon={TicketCheck} value={coupons ? String(used) : "–"} hint="kasada onaylanan" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Son kullanımlar</h2>
            <Link href="/panel/kuponlar" className="text-xs text-accent hover:underline">
              Kuponlar
            </Link>
          </div>
          {uses.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">Henüz kullanılan kupon yok. Müşteri kodu gösterince Kuponlar sayfasından onaylayın.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {uses.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{u.coupons?.title ?? "Kupon"}</span>
                  <span className="shrink-0 text-ink-3">
                    {formatDate(u.redeemed_at, { weekday: undefined })} {formatTime(u.redeemed_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {coupons !== null && menuCount !== null && left.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold">Sayfanızı tamamlayın</h2>
            <p className="mt-0.5 text-xs text-ink-3">Eksiksiz sayfalar daha çok müşteri çeker.</p>
            <div className="mt-3 h-1.5 rounded-full bg-surface-2">
              <div className="h-1.5 rounded-full bg-brand-400" style={{ width: `${((checklist.length - left.length) / checklist.length) * 100}%` }} />
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {checklist.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className={`flex items-center gap-2 ${c.done ? "text-ink-3 line-through" : "text-ink-2 hover:text-ink"}`}>
                    {c.done ? <CheckCircle2 className="size-4 text-ok" /> : <Circle className="size-4 text-ink-3" />} {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
