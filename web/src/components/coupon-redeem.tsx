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
  state: "active" | "attached" | "used" | "expired";
  problem: string | null;
};

const UNDO_MS = 10 * 60 * 1000;

/** Kasada müşterinin gösterdiği kodu sorgular, onaylanınca kullanılmış sayar; 10 dakika geri alınabilir. */
export function CouponRedeem() {
  const { business } = useBusiness();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Kullanılmış sayılan kod ve saati; 10 dakika dolunca geri alma kapanır.
  const [done, setDone] = useState<{ claimId: string; at: number } | null>(null);

  const doneAt = done?.at;
  useEffect(() => {
    if (!doneAt) return;
    const t = setTimeout(() => setDone(null), Math.max(0, doneAt + UNDO_MS - Date.now()));
    return () => clearTimeout(t);
  }, [doneAt]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setFound(null);
    setDone(null);
    const { data, error } = await createClient().rpc("find_coupon_code", { p_business_id: business.id, p_code: code.trim() });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    // Yanlış kodda hata değil null döner.
    if (!data) return setMessage({ ok: false, text: "Kod bulunamadı" });
    setFound(data as Found);
  }

  async function redeem() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await createClient().rpc("redeem_coupon_code", { p_business_id: business.id, p_code: code.trim() });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    if (!data) {
      setFound(null);
      return setMessage({ ok: false, text: "Kod bulunamadı" });
    }
    setFound(null);
    setCode("");
    setDone({ claimId: data as string, at: Date.now() });
    setMessage({ ok: true, text: "Kupon kullanıldı olarak işaretlendi." });
  }

  async function undo() {
    if (!done) return;
    setBusy(true);
    const { error } = await createClient().rpc("undo_coupon_redeem", { p_claim_id: done.claimId });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setDone(null);
    setMessage({ ok: true, text: "Geri alındı; kupon yeniden kullanılabilir." });
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
          {found.problem ? (
            <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{found.problem}</p>
          ) : (
            <button disabled={busy} className="btn btn-primary mt-3" onClick={redeem}>
              {busy && <Loader2 className="size-4 animate-spin" />} Kullanıldı
            </button>
          )}
        </div>
      )}

      {done && (
        <button disabled={busy} className="btn btn-ghost mt-3" onClick={undo}>
          Geri al (10 dakika içinde)
        </button>
      )}
    </section>
  );
}
