"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Section } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

type Pending = {
  review_id: string;
  url: string;
  created_at: string;
  reviews: { rating: number; comment: string; customer_name: string; businesses: { name: string } | null } | null;
};

/** Müşterilerin yorumlarına eklediği, onay bekleyen sonuç fotoğrafları. Onaylanan yorumla herkese görünür. */
export function ReviewPhotoQueue() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("review_photos")
      .select("review_id, url, created_at, reviews(rating, comment, customer_name, businesses(name))")
      .eq("status", "pending")
      .order("created_at")
      .limit(100);
    setRows((data ?? []) as unknown as Pending[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- açılışta kuyruk okunur
    load();
  }, [load]);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError("");
    const { error } = await createClient().rpc("admin_moderate_review_photo", { p_review_id: id, p_approve: approve });
    setBusy(null);
    if (error) return setError(errorMessage(error));
    load();
  }

  if (!rows || rows.length === 0) return null;
  return (
    <Section title={`Onay bekleyen yorum fotoğrafları (${rows.length})`}>
      <p className="mt-1 text-xs text-ink-3">Uygunsuz, başka bir kişiye ait ya da işletmeyle ilgisiz fotoğrafları reddedin.</p>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.review_id} className="rounded-xl p-3 ring-1 ring-line">
            <a href={r.url} target="_blank" rel="noreferrer">
              <img src={r.url} alt="Onay bekleyen yorum fotoğrafı" className="aspect-square w-full rounded-lg object-cover" />
            </a>
            <p className="mt-2 text-sm font-medium">
              {r.reviews?.businesses?.name ?? "İşletme"} · {"★".repeat(r.reviews?.rating ?? 0)}
            </p>
            <p className="line-clamp-2 text-xs text-ink-3">
              {r.reviews?.customer_name}
              {r.reviews?.comment ? `: ${r.reviews.comment}` : ""}
            </p>
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary flex-1 py-1.5 text-sm" disabled={busy === r.review_id} onClick={() => decide(r.review_id, true)}>
                {busy === r.review_id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Onayla
              </button>
              <button className="btn btn-secondary flex-1 py-1.5 text-sm" disabled={busy === r.review_id} onClick={() => decide(r.review_id, false)}>
                <X className="size-4" /> Reddet
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
