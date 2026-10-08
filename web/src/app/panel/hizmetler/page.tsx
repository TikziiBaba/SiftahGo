"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatDuration, formatPrice } from "@/lib/format";
import type { Service } from "@/lib/types";

const EMPTY = { name: "", description: "", duration_minutes: 30, price: 0, is_active: true };

export default function ServicesPage() {
  const { business } = useBusiness();
  const supabase = createClient();
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; values: typeof EMPTY } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("services").select("*").eq("business_id", business.id).order("sort_order").order("created_at");
    setServices((data ?? []) as Service[]);
  }, [supabase, business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hizmetleri ilk açılışta yükle
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const values = { ...editing.values, name: editing.values.name.trim(), description: editing.values.description.trim() };
    const { error } = editing.id
      ? await supabase.from("services").update(values).eq("id", editing.id)
      : await supabase.from("services").insert({ ...values, business_id: business.id, sort_order: services?.length ?? 0 });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEditing(null);
    load();
  }

  async function remove(s: Service) {
    if (!confirm(`"${s.name}" hizmetini silmek istiyor musunuz? Geçmiş randevular silinmez.`)) return;
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Hizmetler</h1>
          <p className="text-sm text-stone-500">Müşterilerin randevu alabileceği hizmetler, süreleri ve fiyatları.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ id: null, values: EMPTY })}>
          <Plus className="size-4" /> Ekle
        </button>
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {editing && (
        <form onSubmit={save} className="card mt-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Hizmet adı</label>
            <input required className="input" placeholder="Örn. Saç Kesimi" value={editing.values.name}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, name: e.target.value } })} />
          </div>
          <div>
            <label className="label">Süre (dakika)</label>
            <input required type="number" min={5} max={600} step={5} className="input" value={editing.values.duration_minutes}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, duration_minutes: Number(e.target.value) } })} />
          </div>
          <div>
            <label className="label">Fiyat (₺)</label>
            <input required type="number" min={0} step="any" className="input" value={editing.values.price}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, price: Number(e.target.value) } })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Açıklama (isteğe bağlı)</label>
            <input className="input" value={editing.values.description}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, description: e.target.value } })} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-brand-700" checked={editing.values.is_active}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, is_active: e.target.checked } })} />
            Online randevuda göster
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy} className="btn btn-primary">{busy && <Loader2 className="size-4 animate-spin" />} Kaydet</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Vazgeç</button>
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-2">
        {services === null && <li className="card h-20 animate-pulse bg-stone-100" />}
        {services?.length === 0 && !editing && (
          <li className="card p-10 text-center text-stone-500">Henüz hizmet yok. İlk hizmetinizi ekleyin.</li>
        )}
        {services?.map((s) => (
          <li key={s.id} className={`card flex items-center gap-4 p-4 ${s.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {s.name} {!s.is_active && <span className="chip ml-1 bg-stone-200 text-stone-600">Gizli</span>}
              </p>
              <p className="text-sm text-stone-500">
                {formatDuration(s.duration_minutes)} · {formatPrice(s.price)}
                {s.description && ` · ${s.description}`}
              </p>
            </div>
            <button className="btn btn-ghost px-2.5" aria-label="Düzenle"
              onClick={() => setEditing({ id: s.id, values: { name: s.name, description: s.description, duration_minutes: s.duration_minutes, price: Number(s.price), is_active: s.is_active } })}>
              <Pencil className="size-4" />
            </button>
            <button className="btn btn-ghost px-2.5 text-rose-600" aria-label="Sil" onClick={() => remove(s)}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
