"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Star, Ticket } from "lucide-react";
import { ReviewForm } from "@/components/review-form";
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
  // Kasada kullanılan vitrin kuponları ve henüz değerlendirilmemiş olanlar (Değerlendir düğmesi için).
  const [showcaseIds, setShowcaseIds] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const canReview = (c: MyCoupon) => c.state === "used" && !!c.redeemed_at && showcaseIds.has(c.business_id) && !reviewed.has(c.claim_id);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("my_coupons");
    if (error) setError(errorMessage(error));
    const rows = (data ?? []) as MyCoupon[];
    // Kupon yorumu yalnızca vitrin işletmelerinde yazılır. my_coupons işletme türünü vermez; ayrıca okunur.
    const used = rows.filter((c) => c.state === "used" && c.redeemed_at);
    if (used.length) {
      const [biz, rev] = await Promise.all([
        supabase.from("businesses").select("id").eq("business_type", "showcase").in("id", [...new Set(used.map((c) => c.business_id))]),
        supabase.from("reviews").select("coupon_claim_id").in("coupon_claim_id", used.map((c) => c.claim_id)),
      ]);
      setShowcaseIds(new Set((biz.data ?? []).map((b) => b.id as string)));
      setReviewed(new Set((rev.data ?? []).map((r) => r.coupon_claim_id as string)));
    }
    setList(rows);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kuponlar ilk açılışta yüklenir
    load();
  }, [load]);

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
    <>
      {thanks && (
        <p className="mb-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-ok" role="status">
          Değerlendirmeniz alındı. Teşekkürler!
        </p>
      )}
    <ul className="space-y-3">
      {list.map((c) => (
        <li key={c.claim_id} className={`card flex flex-wrap items-center gap-4 p-4 ${c.state !== "active" && c.state !== "attached" && !canReview(c) ? "opacity-60" : ""}`}>
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
          {canReview(c) && reviewing !== c.claim_id && (
            <button type="button" onClick={() => setReviewing(c.claim_id)} className="btn btn-primary w-full py-2 sm:w-auto">
              <Star className="size-4" /> Değerlendir
            </button>
          )}
          {reviewing === c.claim_id && (
            <ReviewForm
              submit={(rating, comment) => createClient().rpc("add_coupon_review", { p_claim_id: c.claim_id, p_rating: rating, p_comment: comment })}
              photoFor={{ claimId: c.claim_id }}
              onDone={() => {
                setReviewing(null);
                setThanks(true);
                load();
              }}
            />
          )}
        </li>
      ))}
    </ul>
    </>
  );
}
