"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { LoyaltyCustomer } from "@/lib/types";

export default function LoyaltyPage() {
  return (
    <PlanGate feature="loyalty" title="Sadakat kartı">
      <Loyalty />
    </PlanGate>
  );
}

function Loyalty() {
  const { business, refresh } = useBusiness();
  const supabase = createClient();
  const enabled = business.loyalty_target !== null;
  const [target, setTarget] = useState(String(business.loyalty_target ?? 10));
  const [reward, setReward] = useState(business.loyalty_reward);
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("business_loyalty", { p_business_id: business.id });
    if (error) return setError(errorMessage(error));
    setCustomers((data ?? []) as LoyaltyCustomer[]);
  }, [supabase, business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- liste ilk açılışta yüklenir
    load();
  }, [load, business.loyalty_target]);

  async function save(next: { loyalty_target: number | null; loyalty_reward: string }) {
    setBusy(true);
    setError("");
    const { error } = await supabase.from("businesses").update(next).eq("id", business.id);
    if (error) setError(errorMessage(error));
    else await refresh();
    setBusy(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(target);
    if (!Number.isInteger(n) || n < 2 || n > 50) return setError("Randevu sayısı 2 ile 50 arasında olmalı.");
    if (!reward.trim()) return setError("Ödülü yazın.");
    save({ loyalty_target: n, loyalty_reward: reward.trim() });
  }

  async function give(c: LoyaltyCustomer) {
    setError("");
    const { error } = await supabase.rpc("give_loyalty_reward", { p_business_id: business.id, p_customer_id: c.customer_id });
    if (error) return setError(errorMessage(error));
    load();
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <p className="text-ink-2">İsterseniz açın: tamamlanan her randevu müşteriye bir damga kazandırır, ödülü siz verirsiniz.</p>
      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>}

      <form onSubmit={submit} className="card grid gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div>
            <label className="label" htmlFor="target">Kaç randevuda</label>
            <input id="target" type="number" min={2} max={50} className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="reward">Ödül</label>
            <input id="reward" className="input" maxLength={100} placeholder="Örn. Saç yıkama bedava" value={reward} onChange={(e) => setReward(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="btn btn-primary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />} {enabled ? "Kaydet" : "Kartı aç"}
          </button>
          {enabled && (
            <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => save({ loyalty_target: null, loyalty_reward: "" })}>
              Kartı kapat
            </button>
          )}
        </div>
      </form>

      {enabled && (
        <section className="card p-5">
          <h2 className="font-semibold">Müşteriler</h2>
          {customers.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">Henüz damga kazanan müşteri yok. Elle eklenen randevular damga kazandırmaz.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {customers.map((c) => (
                <li key={c.customer_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-medium">{c.customer_name}</span>
                    <span className="text-sm text-ink-3">{c.visits} randevu{c.available > 0 ? ` · ${c.available} ödül bekliyor` : ""}</span>
                  </span>
                  {c.available > 0 && (
                    <button type="button" className="btn btn-secondary" onClick={() => give(c)}>Ödülü verdim</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
