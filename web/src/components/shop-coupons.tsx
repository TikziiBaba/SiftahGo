"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import { formatCouponWhen, formatDiscount } from "@/lib/coupons";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import { useShopCoupons } from "@/lib/use-shop-coupons";

/** Dükkân sayfasındaki kuponlar. "Kuponu al" girişsizse girişe götürür (next ile geri döner); alınan kuponun kodu görünür. */
export function ShopCoupons({
  businessId,
  slug,
  services,
  showcase = false,
}: {
  businessId: string;
  slug: string;
  services: { id: string; name: string }[];
  /** Randevusuz işletme: kod kasada gösterilir, hizmet listesi yoktur. */
  showcase?: boolean;
}) {
  const router = useRouter();
  const { coupons, claims, loggedIn, refresh } = useShopCoupons(businessId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function claim(id: string) {
    if (loggedIn === false) return router.push(`/giris?next=${encodeURIComponent(`/${slug}#kuponlar`)}`);
    setBusyId(id);
    setError("");
    const { error } = await createClient().rpc("claim_coupon", { p_coupon_id: id });
    setBusyId(null);
    if (error) setError(errorMessage(error));
    refresh();
  }

  if (coupons.length === 0) return null;
  return (
    <section id="kuponlar" className="mt-5 scroll-mt-28">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Ticket className="size-4 text-accent" /> Kuponlar
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {coupons.map((c) => {
          const mine = claims.find((x) => x.coupon_id === c.id);
          const soldOut = !mine && c.total_limit !== null && c.claimed_count >= c.total_limit;
          const names = showcase ? [] : c.service_ids.flatMap((id) => services.find((s) => s.id === id)?.name ?? []);
          return (
            <li key={c.id} className="card flex flex-col gap-1 p-4">
              <p className="font-semibold">{c.title}</p>
              <p className="text-sm font-medium text-accent">{formatDiscount(c)}</p>
              <p className="text-sm text-ink-3">{formatCouponWhen(c)}</p>
              {names.length > 0 && <p className="text-sm text-ink-3">Geçerli: {names.join(", ")}</p>}
              <div className="mt-2">
                {mine ? (
                  <p className="text-sm text-ink-2">
                    Kodunuz{" "}
                    <span className="rounded-lg bg-brand-400/10 px-2 py-1 text-base font-bold tabular-nums tracking-widest text-accent">{mine.code}</span>
                    {mine.state === "attached" && <span className="ml-2 text-ink-3">Randevuya bağlı</span>}
                    {mine.state === "used" && <span className="ml-2 text-ink-3">Kullanıldı</span>}
                  </p>
                ) : soldOut ? (
                  <p className="text-sm text-ink-3">Hakkı tükendi</p>
                ) : (
                  <button type="button" disabled={busyId === c.id || loggedIn === null} onClick={() => claim(c.id)} className="btn btn-secondary py-1.5">
                    {busyId === c.id && <Loader2 className="size-4 animate-spin" />} Kuponu al
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <p className="mt-2 text-xs text-ink-3">
        {showcase ? "Kasada kodu gösterin. Kuponu kullandıktan sonra işletmeyi Kuponlarım’dan değerlendirebilirsiniz." : "Kodu randevu alırken seçin ya da kasada gösterin."}
      </p>
    </section>
  );
}
