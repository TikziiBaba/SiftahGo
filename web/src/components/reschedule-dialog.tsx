"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { bookableDays, DayStrip, SlotGrid } from "@/components/slot-picker";
import { createClient } from "@/lib/supabase/client";
import { dayOf, errorMessage, formatDate, formatTime } from "@/lib/format";
import type { Appointment, WorkingHour } from "@/lib/types";

type Props = {
  appointment: Pick<Appointment, "id" | "business_id" | "service_id" | "staff_id" | "starts_at" | "service_name">;
  onClose: () => void;
  onDone: () => void;
};

/** Randevunun saatini değiştirir (müşteri veya işletme sahibi). Aynı personelin boş saatleri gösterilir. */
export function RescheduleDialog({ appointment: a, onClose, onDone }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [days, setDays] = useState<{ day: string; open: boolean }[] | null>(null);
  const [day, setDay] = useState(() => dayOf(a.starts_at));
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const times = slotResult?.key === `${day}|${reload}` ? slotResult.times : null;

  useEffect(() => {
    Promise.all([
      supabase.from("businesses").select("booking_days").eq("id", a.business_id).maybeSingle(),
      supabase.from("working_hours").select("*").eq("business_id", a.business_id),
    ]).then(([b, h]) => setDays(bookableDays(b.data?.booking_days ?? 30, (h.data ?? []) as WorkingHour[])));
  }, [supabase, a.business_id]);

  useEffect(() => {
    let active = true;
    const key = `${day}|${reload}`;
    supabase
      .rpc("get_available_slots", {
        p_business_id: a.business_id,
        p_service_id: a.service_id,
        p_day: day,
        p_staff_id: a.staff_id,
        p_ignore: a.id,
      })
      .then(({ data }) => {
        if (!active) return;
        const current = new Date(a.starts_at).getTime();
        const unique = [...new Set(((data ?? []) as { slot_start: string }[]).map((s) => s.slot_start))];
        setSlotResult({ key, times: unique.filter((t) => new Date(t).getTime() !== current) });
      });
    return () => {
      active = false;
    };
  }, [supabase, a.id, a.business_id, a.service_id, a.staff_id, a.starts_at, day, reload]);

  async function save() {
    if (!time) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("reschedule_appointment", { p_id: a.id, p_starts_at: time, p_staff_id: a.staff_id });
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      if (error.message.includes("müsait değil")) {
        setTime(null);
        setReload((r) => r + 1);
      }
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="reschedule-title" className="text-lg font-bold">Saati değiştir</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost px-2" aria-label="Kapat">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-3">
          {a.service_name} · şu an {formatDate(a.starts_at, { weekday: undefined })} {formatTime(a.starts_at)}
        </p>

        <div className="mt-5">
          {days === null ? (
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <DayStrip
              days={days}
              value={day}
              onChange={(d) => {
                setDay(d);
                setTime(null);
              }}
            />
          )}
          <div className="mt-3">
            <SlotGrid times={times} value={time} onChange={setTime} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button type="button" disabled={!time || busy} onClick={save} className="btn btn-primary mt-5 w-full py-3">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {time ? `${formatDate(time, { weekday: undefined })} ${formatTime(time)} olarak değiştir` : "Yeni saat seçin"}
        </button>
      </div>
    </div>
  );
}
