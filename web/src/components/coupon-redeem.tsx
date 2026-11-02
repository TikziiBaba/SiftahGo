"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import { formatDiscount } from "@/lib/coupons";

type Found = {
  claim_id: string;
  title: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  customer_name: string;
  state: "active" | "attached" | "used" | "expired" | "unavailable";
  problem: string | null;
  redeemed_at: string | null;
};

const UNDO_MS = 10 * 60 * 1000;

/** Kasada müşterinin gösterdiği kodu sorgular, onaylanınca kullanılmış sayar; 10 dakika geri alınabilir. */
export function CouponRedeem() {
  const { business } = useBusiness();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Kasada işaretlenmiş ve 10 dakikası dolmamış kod geri alınabilir. Sunucudaki redeemed_at'tan hesaplanır: sonraki
  // sorgu ve sayfa yenilemesi de geri almayı gösterir; süre dolunca düğme kapanır.
  const [undoable, setUndoable] = useState(false);

  const redeemedAt = found?.redeemed_at;
  useEffect(() => {
    if (!undoable || !redeemedAt) return;
    const t = setTimeout(() => setUndoable(false), Math.max(0, new Date(redeemedAt).getTime() + UNDO_MS - Date.now()));
    return () => clearTimeout(t);
  }, [undoable, redeemedAt]);

  async function lookup() {
    const { data, error } = await createClient().rpc("find_coupon_code", { p_business_id: business.id, p_code: code.trim() });
    if (error) {
      setMessage({ ok: false, text: errorMessage(error) });
      return false;
    }
    // Yanlış kodda hata değil null döner.
    if (!data) {
      setMessage({ ok: false, text: "Kod bulunamadı" });
      return false;
    }
    const f = data as Found;
    setFound(f);
    setUndoable(f.state === "used" && !!f.redeemed_at && Date.now() - new Date(f.redeemed_at).getTime() < UNDO_MS);
    return true;
  }

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setFound(null);
    setUndoable(false);
    await lookup();
    setBusy(false);
  }

  async function redeem() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await createClient().rpc("redeem_coupon_code", { p_business_id: business.id, p_code: code.trim() });
    if (error) {
      setBusy(false);
      return setMessage({ ok: false, text: errorMessage(error) });
    }
    if (!data) {
      setBusy(false);
      setFound(null);
      return setMessage({ ok: false, text: "Kod bulunamadı" });
    }
    // Kart yeniden okunur: kullanıldı görünür ve 10 dakika "Geri al" açık kalır.
    const ok = await lookup();
    setBusy(false);
    if (ok) setMessage({ ok: true, text: "Kupon kullanıldı olarak işaretlendi." });
  }

  async function undo() {
    if (!found) return;
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("undo_coupon_redeem", { p_claim_id: found.claim_id });
    if (error) {
      setBusy(false);
      return setMessage({ ok: false, text: errorMessage(error) });
    }
    const ok = await lookup();
    setBusy(false);
    if (ok) setMessage({ ok: true, text: "Geri alındı; kupon yeniden kullanılabilir." });
  }

  return (
    <section className="card mt-6 p-5">
      <h2 className="font-semibold">Kod gir</h2>
      <p className="text-sm text-ink-3">Müşterinin gösterdiği 6 haneli kodu girin; indirimi uygulayınca &quot;Kullanıldı&quot; deyin.</p>
      <form onSubmit={find} className="mt-3 flex gap-2">
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          className="input w-36 tracking-[0.3em]"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            setFound(null);
            setMessage(null);
            setUndoable(false);
          }}
        />
        <button disabled={busy || code.length !== 6} className="btn btn-secondary">
          {busy && <Loader2 className="size-4 animate-spin" />} Sorgula
        </button>
      </form>

      {message && (
        <p className={`mt-3 rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{message.text}</p>
      )}

      {found && (
        <div className="mt-3 rounded-xl bg-surface-2 p-4">
          <p className="font-semibold">{found.title}</p>
          <p className="text-sm text-ink-3">
            {formatDiscount(found)} · {found.customer_name}
          </p>
          {found.problem && <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{found.problem}</p>}
          {undoable ? (
            <button disabled={busy} className="btn btn-ghost mt-3" onClick={undo}>
              Geri al (10 dakika içinde)
            </button>
          ) : (
            !found.problem && (
              <button disabled={busy} className="btn btn-primary mt-3" onClick={redeem}>
                {busy && <Loader2 className="size-4 animate-spin" />} Kullanıldı
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
