"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { Service, Staff, StaffService } from "@/lib/types";

const EMPTY = { name: "", title: "", is_active: true, service_ids: [] as string[] };

export default function StaffPage() {
  const { business } = useBusiness();
  const supabase = createClient();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<StaffService[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; values: typeof EMPTY } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [st, sv] = await Promise.all([
      supabase.from("staff").select("*").eq("business_id", business.id).order("sort_order").order("created_at"),
      supabase.from("services").select("*").eq("business_id", business.id).order("sort_order").order("created_at"),
    ]);
    const list = (st.data ?? []) as Staff[];
    const { data: ss } = list.length
      ? await supabase.from("staff_services").select("*").in("staff_id", list.map((x) => x.id))
      : { data: [] };
    setStaff(list);
    setServices((sv.data ?? []) as Service[]);
    setLinks((ss ?? []) as StaffService[]);
  }, [supabase, business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- personeli ilk açılışta yükle
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const { service_ids, ...rest } = editing.values;
    const values = { ...rest, name: rest.name.trim(), title: rest.title.trim() };
    const { data, error } = editing.id
      ? await supabase.from("staff").update(values).eq("id", editing.id).select("id").single()
      : await supabase.from("staff").insert({ ...values, business_id: business.id, sort_order: staff?.length ?? 0 }).select("id").single();
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    // Hizmet seçimi: hiçbiri seçilmezse personel tüm hizmetleri verir.
    await supabase.from("staff_services").delete().eq("staff_id", data.id);
    if (service_ids.length) {
      const { error: linkError } = await supabase
        .from("staff_services")
        .insert(service_ids.map((service_id) => ({ staff_id: data.id, service_id })));
      if (linkError) setError(errorMessage(linkError));
    }
    setBusy(false);
    setEditing(null);
    load();
  }

  async function remove(s: Staff) {
    if (!confirm(`"${s.name}" silinsin mi? Bu kişiye ait gelecekteki randevular personelsiz kalır.`)) return;
    const { error } = await supabase.from("staff").delete().eq("id", s.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  const activeCount = staff?.filter((s) => s.is_active).length ?? 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Personel</h1>
          <p className="text-sm text-stone-500">
            Her personelin ayrı takvimi olur; aynı saatte her biri ayrı randevu alabilir.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ id: null, values: EMPTY })}>
          <Plus className="size-4" /> Ekle
        </button>
      </div>

      {activeCount === 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Aktif personel olmadığı için müşteriler randevu alamaz.
        </p>
      )}
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {editing && (
        <form onSubmit={save} className="card mt-6 grid gap-3 p-5 sm:grid-cols-2">
          <div>
            <label className="label">Ad Soyad</label>
            <input required className="input" value={editing.values.name}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, name: e.target.value } })} />
          </div>
          <div>
            <label className="label">Unvan (isteğe bağlı)</label>
            <input className="input" placeholder="Örn. Usta, Kalfa, Uzman" value={editing.values.title}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, title: e.target.value } })} />
          </div>
          {services.length > 0 && (
            <fieldset className="sm:col-span-2">
              <legend className="label">Verdiği hizmetler</legend>
              <p className="mb-2 text-xs text-stone-500">Hiçbirini seçmezseniz tüm hizmetleri verebilir.</p>
              <div className="flex flex-wrap gap-2">
                {services.map((sv) => {
                  const on = editing.values.service_ids.includes(sv.id);
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          values: {
                            ...editing.values,
                            service_ids: on ? editing.values.service_ids.filter((x) => x !== sv.id) : [...editing.values.service_ids, sv.id],
                          },
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-brand-600 bg-brand-700 text-white" : "border-stone-300 hover:bg-stone-50"}`}
                    >
                      {sv.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-brand-700" checked={editing.values.is_active}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, is_active: e.target.checked } })} />
            Randevu alabilir
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy} className="btn btn-primary">{busy && <Loader2 className="size-4 animate-spin" />} Kaydet</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Vazgeç</button>
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-2">
        {staff === null && <li className="card h-20 animate-pulse bg-stone-100" />}
        {staff?.map((s) => (
          <li key={s.id} className={`card flex items-center gap-4 p-4 ${s.is_active ? "" : "opacity-60"}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800">
              {s.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {s.name} {!s.is_active && <span className="chip ml-1 bg-stone-200 text-stone-600">Pasif</span>}
              </p>
              <p className="text-sm text-stone-500">
                {[
                  s.title,
                  links.some((l) => l.staff_id === s.id)
                    ? services.filter((sv) => links.some((l) => l.staff_id === s.id && l.service_id === sv.id)).map((sv) => sv.name).join(", ")
                    : "Tüm hizmetler",
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button className="btn btn-ghost px-2.5" aria-label="Düzenle"
              onClick={() =>
                setEditing({
                  id: s.id,
                  values: {
                    name: s.name,
                    title: s.title,
                    is_active: s.is_active,
                    service_ids: links.filter((l) => l.staff_id === s.id).map((l) => l.service_id),
                  },
                })
              }>
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
