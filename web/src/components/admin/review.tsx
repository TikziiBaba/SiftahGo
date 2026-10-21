"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { Business } from "@/lib/types";

/** Başvuruyu onaylar ya da sebebiyle reddeder (admin_review_business). Sebep işletme sahibine gösterilir. */
export function ReviewActions({ business: b, onDone }: { business: Business; onDone: () => Promise<void> }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  async function review(approve: boolean) {
    if (approve && !confirm(`${b.name} onaylansın mı? Sayfası yayına açılır ve 7 günlük Pro denemesi başlar.`)) return;
    setBusy(approve ? "approve" : "reject");
    setError("");
    const { error } = await createClient().rpc("admin_review_business", { p_business_id: b.id, p_approve: approve, p_note: note });
    setBusy(null);
    if (error) return setError(errorMessage(error));
    setRejecting(false);
    setNote("");
    await onDone();
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>}
      {rejecting ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            review(false);
          }}
          className="space-y-2"
        >
          <label className="label text-xs" htmlFor={`note-${b.id}`}>
            Ret sebebi (işletme sahibi görür)
          </label>
          <textarea
            id={`note-${b.id}`}
            required
            autoFocus
            minLength={3}
            maxLength={500}
            rows={3}
            className="input"
            placeholder="Örn. Adres eksik; mahalle ve kapı numarasını yazın."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => setRejecting(false)} className="btn btn-secondary flex-1">
              Vazgeç
            </button>
            <button disabled={!!busy} className="btn flex-1 bg-rose-500/10 text-bad ring-1 ring-rose-400/20 hover:bg-rose-500/20">
              {busy === "reject" && <Loader2 className="size-4 animate-spin" />} Reddet
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => review(true)} className="btn btn-primary flex-1">
            {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Onayla
          </button>
          <button type="button" disabled={!!busy} onClick={() => setRejecting(true)} className="btn btn-secondary flex-1">
            <X className="size-4" /> Reddet
          </button>
        </div>
      )}
    </div>
  );
}
