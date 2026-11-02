"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, errorMessage, formatDate, todayStr } from "@/lib/format";
import type { FreezeRequest } from "@/lib/types";

const day = (d: string) => formatDate(d, { weekday: undefined, year: "numeric", month: "short" });

/** İşletme sahibi askıya alamaz; dondurma talebi açar, yönetici uygular ya da gerekçeyle reddeder. */
export function FreezeRequestSection({ businessId, suspended, showcase = false }: { businessId: string; suspended: boolean; showcase?: boolean }) {
  const [last, setLast] = useState<FreezeRequest | null | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [startsOn, setStartsOn] = useState(todayStr());
  const [endsOn, setEndsOn] = useState(addDays(todayStr(), 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("freeze_requests")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLast((data as FreezeRequest | null) ?? null);
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- son talebi ilk açılışta yükle
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().rpc("request_freeze", { p_reason: reason, p_starts_on: startsOn, p_ends_on: endsOn });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setReason("");
    await load();
  }

  const pending = last?.status === "pending";

  return (
    <section>
      <h2 className="text-xl font-bold">Sayfayı dondurma talebi</h2>
      <p className="mt-1 text-sm text-ink-3">
        Bir süre hizmet veremeyecekseniz talep açın. Ekibimiz uygulayınca sayfanız görünmez{showcase ? "" : ", randevu alınmaz"} ve dondurulan süre aboneliğinize eklenir.
      </p>
      <div className="card mt-4 space-y-4 p-5">
        {last && (
          <div className="rounded-xl bg-tint/[0.03] p-3 text-sm ring-1 ring-line">
            <p className="font-medium">
              {last.status === "pending" ? "Talebiniz inceleniyor" : last.status === "approved" ? "Talebiniz uygulandı" : "Talebiniz reddedildi"}
            </p>
            <p className="mt-0.5 text-ink-3">{day(last.starts_on)} – {day(last.ends_on)}</p>
            {last.admin_note && <p className="mt-1 text-ink-2">{last.admin_note}</p>}
          </div>
        )}
        {last !== undefined && !pending && !suspended && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Başlangıç</span>
                <input className="input" type="date" required min={todayStr()} value={startsOn}
                  onChange={(e) => { setStartsOn(e.target.value); if (endsOn < e.target.value) setEndsOn(e.target.value); }} />
              </label>
              <label>
                <span className="label">Bitiş</span>
                <input className="input" type="date" required min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </label>
            </div>
            <label className="block">
              <span className="label">Sebep</span>
              <textarea className="input" required minLength={3} maxLength={500} rows={3} placeholder="Örn. Dükkânda tadilat var." value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button disabled={busy} className="btn btn-secondary">
              {busy && <Loader2 className="size-4 animate-spin" />} Talep gönder
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
