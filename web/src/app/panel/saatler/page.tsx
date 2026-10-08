"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { WEEKDAYS } from "@/lib/constants";
import { errorMessage, formatDate, formatTime, toIso } from "@/lib/format";
import type { Staff, TimeOff, WorkingHour } from "@/lib/types";

export default function HoursPage() {
  const { business } = useBusiness();
  const supabase = createClient();
  const [hours, setHours] = useState<WorkingHour[] | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [offForm, setOffForm] = useState<{ staff_id: string; start: string; end: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    const [h, t, s] = await Promise.all([
      supabase.from("working_hours").select("*").eq("business_id", business.id).order("weekday"),
      supabase.from("time_off").select("*").eq("business_id", business.id).gte("ends_at", new Date().toISOString()).order("starts_at"),
      supabase.from("staff").select("*").eq("business_id", business.id).order("sort_order"),
    ]);
    setHours((h.data ?? []) as WorkingHour[]);
    setTimeOff((t.data ?? []) as TimeOff[]);
    setStaff((s.data ?? []) as Staff[]);
  }, [supabase, business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saatleri ilk açılışta yükle
    load();
  }, [load]);

  function update(weekday: number, patch: Partial<WorkingHour>) {
    setHours((list) => list!.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  }

  async function saveHours() {
    if (!hours) return;
    const invalid = hours.find((h) => h.is_open && h.close_time.slice(0, 5) <= h.open_time.slice(0, 5));
    if (invalid) return setMessage({ ok: false, text: `${WEEKDAYS[invalid.weekday - 1]}: kapanış saati açılıştan sonra olmalı.` });
    setBusy(true);
    const { error } = await supabase.from("working_hours").upsert(hours);
    setBusy(false);
    setMessage(error ? { ok: false, text: errorMessage(error) } : { ok: true, text: "Çalışma saatleri kaydedildi." });
  }

  async function addTimeOff(e: React.FormEvent) {
    e.preventDefault();
    if (!offForm) return;
    const starts = toIso(offForm.start.slice(0, 10), offForm.start.slice(11, 16));
    const ends = toIso(offForm.end.slice(0, 10), offForm.end.slice(11, 16));
    if (ends <= starts) return setMessage({ ok: false, text: "Bitiş, başlangıçtan sonra olmalı." });
    const { error } = await supabase.from("time_off").insert({
      business_id: business.id,
      staff_id: offForm.staff_id || null,
      starts_at: starts,
      ends_at: ends,
      reason: offForm.reason.trim(),
    });
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setOffForm(null);
    load();
  }

  async function removeTimeOff(id: string) {
    await supabase.from("time_off").delete().eq("id", id);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-xl font-bold">Çalışma saatleri</h1>
        <p className="text-sm text-ink-3">Müşteriler sadece açık olduğunuz saatlerde randevu alabilir.</p>

        <div className="card mt-4 divide-y divide-line">
          {hours === null && <div className="h-64 animate-pulse bg-surface-2" />}
          {hours?.map((h) => (
            <div key={h.weekday} className="flex flex-wrap items-center gap-3 p-4">
              <label className="flex w-36 items-center gap-2 font-medium">
                <input type="checkbox" className="size-4 accent-brand-400" checked={h.is_open} onChange={(e) => update(h.weekday, { is_open: e.target.checked })} />
                {WEEKDAYS[h.weekday - 1]}
              </label>
              {h.is_open ? (
                <div className="flex items-center gap-2">
                  <input type="time" className="input w-auto py-2" value={h.open_time.slice(0, 5)} onChange={(e) => update(h.weekday, { open_time: e.target.value })} />
                  <span className="text-ink-3">–</span>
                  <input type="time" className="input w-auto py-2" value={h.close_time.slice(0, 5)} onChange={(e) => update(h.weekday, { close_time: e.target.value })} />
                </div>
              ) : (
                <span className="text-sm text-ink-3">Kapalı</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button disabled={busy || !hours} onClick={saveHours} className="btn btn-primary">
            {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
          </button>
          {message && <p className={`text-sm ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>{message.text}</p>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">İzin ve tatiller</h2>
            <p className="text-sm text-ink-3">Bu aralıklarda randevu alınamaz (öğle arası, tatil, izin günü vb.).</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setOffForm({ staff_id: "", start: "", end: "", reason: "" })}>
            <Plus className="size-4" /> Ekle
          </button>
        </div>

        {offForm && (
          <form onSubmit={addTimeOff} className="card mt-4 grid gap-3 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Kim için?</label>
              <select className="input" value={offForm.staff_id} onChange={(e) => setOffForm({ ...offForm, staff_id: e.target.value })}>
                <option value="">Tüm işletme kapalı</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Başlangıç</label>
              <input required type="datetime-local" className="input" value={offForm.start} onChange={(e) => setOffForm({ ...offForm, start: e.target.value })} />
            </div>
            <div>
              <label className="label">Bitiş</label>
              <input required type="datetime-local" className="input" value={offForm.end} onChange={(e) => setOffForm({ ...offForm, end: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Açıklama (isteğe bağlı)</label>
              <input className="input" placeholder="Örn. Bayram tatili" value={offForm.reason} onChange={(e) => setOffForm({ ...offForm, reason: e.target.value })} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button className="btn btn-primary">Kaydet</button>
              <button type="button" className="btn btn-ghost" onClick={() => setOffForm(null)}>Vazgeç</button>
            </div>
          </form>
        )}

        <ul className="mt-4 space-y-2">
          {timeOff.length === 0 && !offForm && <li className="card p-6 text-center text-sm text-ink-3">Planlanmış izin yok.</li>}
          {timeOff.map((t) => (
            <li key={t.id} className="card flex items-center gap-3 p-4 text-sm">
              <div className="flex-1">
                <p className="font-medium">
                  {formatDate(t.starts_at, { weekday: undefined })} {formatTime(t.starts_at)} → {formatDate(t.ends_at, { weekday: undefined })} {formatTime(t.ends_at)}
                </p>
                <p className="text-ink-3">
                  {t.staff_id ? staff.find((s) => s.id === t.staff_id)?.name : "Tüm işletme"}
                  {t.reason && ` · ${t.reason}`}
                </p>
              </div>
              <button className="btn btn-ghost px-2.5 text-rose-400" aria-label="Sil" onClick={() => removeTimeOff(t.id)}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
