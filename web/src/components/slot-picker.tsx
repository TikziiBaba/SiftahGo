"use client";

import { Loader2 } from "lucide-react";
import { addDays, formatTime, isoWeekday, todayStr } from "@/lib/format";
import type { WorkingHour } from "@/lib/types";

/** Randevu alınabilecek günler (bugünden itibaren, en fazla 30 gün); kapalı günler işaretli. */
export function bookableDays(bookingDays: number, hours: WorkingHour[]) {
  const start = todayStr();
  return Array.from({ length: Math.min(bookingDays, 30) + 1 }, (_, i) => {
    const d = addDays(start, i);
    const open = hours.find((h) => h.weekday === isoWeekday(d))?.is_open ?? false;
    return { day: d, open };
  });
}

export function DayStrip({
  days,
  value,
  onChange,
}: {
  days: { day: string; open: boolean }[];
  value: string;
  onChange: (day: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
      {days.map(({ day: d, open }) => {
        const date = new Date(`${d}T12:00:00Z`);
        return (
          <button
            key={d}
            type="button"
            disabled={!open}
            onClick={() => onChange(d)}
            className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-sm transition disabled:opacity-40 ${
              d === value ? "border-brand-400 bg-brand-700 text-white" : "border-line hover:border-line-strong"
            }`}
          >
            <span className="text-xs">{date.toLocaleDateString("tr-TR", { weekday: "short", timeZone: "UTC" })}</span>
            <span className="text-lg font-semibold">{date.getUTCDate()}</span>
            <span className="text-xs">{date.toLocaleDateString("tr-TR", { month: "short", timeZone: "UTC" })}</span>
          </button>
        );
      })}
    </div>
  );
}

/** times: null = yükleniyor */
export function SlotGrid({
  times,
  value,
  onChange,
}: {
  times: string[] | null;
  value: string | null;
  onChange: (time: string) => void;
}) {
  if (times === null) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-ink-3">
        <Loader2 className="size-4 animate-spin" /> Boş saatler yükleniyor…
      </div>
    );
  }
  if (times.length === 0) {
    return <p className="rounded-xl bg-surface-2 p-4 text-sm text-ink-3">Bu gün için boş saat yok. Lütfen başka bir gün seçin.</p>;
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {times.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-lg border py-2 text-sm font-medium transition ${
            t === value ? "border-brand-400 bg-brand-700 text-white" : "border-line hover:border-brand-400"
          }`}
        >
          {formatTime(t)}
        </button>
      ))}
    </div>
  );
}
