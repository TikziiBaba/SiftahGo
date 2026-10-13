"use client";

import { useState } from "react";
import { Loader2, Minus, Package, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { Service, SessionPackage } from "@/lib/types";

type Props = {
  businessId: string;
  phoneKey: string;
  customerName: string;
  packages: SessionPackage[];
  services: Service[];
  adding: boolean;
  onAddDone: () => void;
  onChange: (update: (all: SessionPackage[]) => SessionPackage[]) => void;
};

/**
 * Müşterinin seans paketleri (müşteri defterinde): kalan seans, elle düzeltme ve silme, yeni paket.
 * Paketteki hizmetten tamamlanan randevu bir seansı kendiliğinden düşer.
 */
export function SessionPackages({ businessId, phoneKey, customerName, packages, services, adding, onAddDone, onChange }: Props) {
  const [form, setForm] = useState({ service_id: services[0]?.id ?? "", total: "10" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const service = services.find((s) => s.id === form.service_id);
    const total = Number(form.total);
    if (!service || !Number.isInteger(total) || total < 1 || total > 500) {
      return setError("Hizmet seçin ve 1 ile 500 arasında seans sayısı yazın.");
    }
    setBusy(true);
    setError("");
    const { data, error } = await createClient()
      .from("session_packages")
      .insert({ business_id: businessId, phone_key: phoneKey, customer_name: customerName, service_id: service.id, name: `${service.name} paketi`, total })
      .select("*")
      .single();
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onChange((all) => [...all, data as SessionPackage]);
    onAddDone();
  }

  async function setUsed(p: SessionPackage, used: number) {
    setError("");
    onChange((all) => all.map((x) => (x.id === p.id ? { ...x, used } : x)));
    const { error } = await createClient().from("session_packages").update({ used }).eq("id", p.id);
    if (error) {
      setError(errorMessage(error));
      onChange((all) => all.map((x) => (x.id === p.id ? p : x)));
    }
  }

  async function remove(p: SessionPackage) {
    if (!confirm(`"${p.name}" silinsin mi?`)) return;
    const { error } = await createClient().from("session_packages").delete().eq("id", p.id);
    if (error) return setError(errorMessage(error));
    onChange((all) => all.filter((x) => x.id !== p.id));
  }

  if (packages.length === 0 && !adding) return null;

  return (
    <div className="w-full space-y-2">
      {packages.map((p) => {
        const left = p.total - p.used;
        return (
          <div key={p.id} className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pl-3 pr-1.5 text-sm">
            <Package className="size-4 shrink-0 text-brand-300" />
            <p className="min-w-0 flex-1">
              <span className="font-medium">{p.name}</span>
              <span className={left > 0 ? "text-ink-3" : "text-amber-300"}>
                {" · "}
                {left > 0 ? `${left}/${p.total} seans kaldı` : "Bitti"}
              </span>
            </p>
            <button type="button" className="btn btn-ghost px-2 py-1" aria-label="Bir seans düş" title="Bir seans düş" disabled={left === 0} onClick={() => setUsed(p, p.used + 1)}>
              <Minus className="size-4" />
            </button>
            <button type="button" className="btn btn-ghost px-2 py-1" aria-label="Bir seans iade et" title="Bir seans iade et" disabled={p.used === 0} onClick={() => setUsed(p, p.used - 1)}>
              <Plus className="size-4" />
            </button>
            <button type="button" className="btn btn-ghost px-2 py-1 text-rose-400" aria-label="Paketi sil" title="Paketi sil" onClick={() => remove(p)}>
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
      {adding && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor={`pkg-service-${phoneKey}`}>Hizmet</label>
            <select id={`pkg-service-${phoneKey}`} className="input" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`pkg-total-${phoneKey}`}>Seans</label>
            <input
              id={`pkg-total-${phoneKey}`}
              type="number"
              min={1}
              max={500}
              className="input w-24"
              value={form.total}
              onChange={(e) => setForm({ ...form, total: e.target.value })}
            />
          </div>
          <button disabled={busy} className="btn btn-primary">
            {busy && <Loader2 className="size-4 animate-spin" />} Paketi ekle
          </button>
          <button type="button" className="btn btn-ghost" onClick={onAddDone}>Vazgeç</button>
        </form>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
