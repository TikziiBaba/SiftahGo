"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { WEEKDAYS } from "@/lib/constants";
import { errorMessage } from "@/lib/format";
import type { Service, Staff, StaffHour, StaffService, WorkingHour } from "@/lib/types";

type Day = Pick<StaffHour, "weekday" | "is_open" | "open_time" | "close_time">;
// hours boşsa personel işletme saatlerinde çalışır.
const EMPTY = { name: "", title: "", is_active: true, service_ids: [] as string[], hours: [] as Day[] };

export default function StaffPage() {
  const { business } = useBusiness();
  const supabase = createClient();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<StaffService[]>([]);
  const [staffHours, setStaffHours] = useState<StaffHour[]>([]);
  const [businessHours, setBusinessHours] = useState<WorkingHour[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; values: typeof EMPTY } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [st, sv, wh] = await Promise.all([
      supabase.from("staff").select("*").eq("business_id", business.id).order("sort_order").order("created_at"),
      supabase.from("services").select("*").eq("business_id", business.id).order("sort_order").order("created_at"),
      supabase.from("working_hours").select("*").eq("business_id", business.id).order("weekday"),
    ]);
    const list = (st.data ?? []) as Staff[];
    const ids = list.map((x) => x.id);
    const [{ data: ss }, { data: sh }] = list.length
      ? await Promise.all([
          supabase.from("staff_services").select("*").in("staff_id", ids),
          supabase.from("staff_hours").select("*").in("staff_id", ids).order("weekday"),
        ])
      : [{ data: [] }, { data: [] }];
    setStaff(list);
    setServices((sv.data ?? []) as Service[]);
    setLinks((ss ?? []) as StaffService[]);
    setStaffHours((sh ?? []) as StaffHour[]);
    setBusinessHours((wh.data ?? []) as WorkingHour[]);
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
    const { service_ids, hours, ...rest } = editing.values;
    const invalid = hours.find((h) => h.is_open && h.close_time.slice(0, 5) <= h.open_time.slice(0, 5));
    if (invalid) {
      setBusy(false);
      return setError(`${WEEKDAYS[invalid.weekday - 1]}: bitiş saati başlangıçtan sonra olmalı.`);
    }
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
    await supabase.from("staff_hours").delete().eq("staff_id", data.id);
    if (hours.length) {
      const { error: hoursError } = await supabase.from("staff_hours").insert(hours.map((h) => ({ ...h, staff_id: data.id })));
      if (hoursError) setError(errorMessage(hoursError));
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

  // Kendi saatleri işletme saatlerinden başlar.
  const defaultHours = (): Day[] =>
    businessHours.map(({ weekday, is_open, open_time, close_time }) => ({ weekday, is_open, open_time, close_time }));

  function setDay(weekday: number, patch: Partial<Day>) {
    if (!editing) return;
    setEditing({
      ...editing,
      values: { ...editing.values, hours: editing.values.hours.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)) },
    });
  }

  const activeCount = staff?.filter((s) => s.is_active).length ?? 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Personel</h1>
          <p className="text-sm text-ink-3">
            Her personelin ayrı takvimi olur; aynı saatte her biri ayrı randevu alabilir.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ id: null, values: EMPTY })}>
          <Plus className="size-4" /> Ekle
        </button>
      </div>

      {activeCount === 0 && (
        <p className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
          Aktif personel olmadığı için müşteriler randevu alamaz.
        </p>
      )}
      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

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
              <p className="mb-2 text-xs text-ink-3">Hiçbirini seçmezseniz tüm hizmetleri verebilir.</p>
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
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-brand-400 bg-brand-700 text-white" : "border-line-strong hover:bg-white/5"}`}
                    >
                      {sv.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <fieldset className="sm:col-span-2">
            <legend className="label">Çalışma saatleri</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand-400" checked={editing.values.hours.length > 0}
                onChange={(e) => setEditing({ ...editing, values: { ...editing.values, hours: e.target.checked ? defaultHours() : [] } })} />
              Kendi saatleri var (işaretlemezseniz işletme saatlerinde çalışır)
            </label>
            {editing.values.hours.length > 0 && (
              <ul className="mt-3 space-y-2">
                {editing.values.hours.map((h) => {
                  const shopOpen = businessHours.find((b) => b.weekday === h.weekday)?.is_open;
                  const day = WEEKDAYS[h.weekday - 1];
                  return (
                    <li key={h.weekday} className="flex flex-wrap items-center gap-3">
                      <label className="flex w-32 items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4 accent-brand-400" checked={shopOpen && h.is_open} disabled={!shopOpen}
                          onChange={(e) => setDay(h.weekday, { is_open: e.target.checked })} />
                        {day}
                      </label>
                      {!shopOpen ? (
                        <span className="text-sm text-ink-3">İşletme kapalı</span>
                      ) : h.is_open ? (
                        <span className="flex items-center gap-2">
                          <input type="time" className="input w-auto py-2" aria-label={`${day} başlangıç`} value={h.open_time.slice(0, 5)}
                            onChange={(e) => setDay(h.weekday, { open_time: e.target.value })} />
                          <span className="text-ink-3">–</span>
                          <input type="time" className="input w-auto py-2" aria-label={`${day} bitiş`} value={h.close_time.slice(0, 5)}
                            onChange={(e) => setDay(h.weekday, { close_time: e.target.value })} />
                        </span>
                      ) : (
                        <span className="text-sm text-ink-3">Çalışmıyor</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-brand-400" checked={editing.values.is_active}
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
        {staff === null && <li className="card h-20 animate-pulse bg-surface-2" />}
        {staff?.map((s) => (
          <li key={s.id} className={`card flex items-center gap-4 p-4 ${s.is_active ? "" : "opacity-60"}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-400/15 font-semibold text-brand-300">
              {s.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {s.name} {!s.is_active && <span className="chip ml-1 bg-surface-3 text-ink-2">Pasif</span>}
              </p>
              <p className="text-sm text-ink-3">
                {[
                  s.title,
                  links.some((l) => l.staff_id === s.id)
                    ? services.filter((sv) => links.some((l) => l.staff_id === s.id && l.service_id === sv.id)).map((sv) => sv.name).join(", ")
                    : "Tüm hizmetler",
                  staffHours.some((h) => h.staff_id === s.id) && "Kendi saatleri",
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
                    hours: staffHours
                      .filter((h) => h.staff_id === s.id)
                      .map(({ weekday, is_open, open_time, close_time }) => ({ weekday, is_open, open_time, close_time })),
                  },
                })
              }>
              <Pencil className="size-4" />
            </button>
            <button className="btn btn-ghost px-2.5 text-rose-400" aria-label="Sil" onClick={() => remove(s)}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
