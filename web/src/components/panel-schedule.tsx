"use client";

import { STATUS_COLORS } from "@/components/charts";
import { STATUS } from "@/lib/constants";
import { addDays, dayOf, formatDate, formatTime, isoWeekday, todayStr } from "@/lib/format";
import type { Appointment, Staff, WorkingHour } from "@/lib/types";

type Row = Appointment & { staff: { name: string } | null };

const HOUR_PX = 64;

const minutesOf = (iso: string) => {
  const t = formatTime(iso).split(":").map(Number);
  return t[0] * 60 + t[1];
};
const hm = (time: string) => {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

/** Günün saat aralığı: çalışma saatleri + o gün saat dışına taşan randevular. */
function range(day: string, hours: WorkingHour[], rows: Row[]) {
  const wh = hours.find((h) => h.weekday === isoWeekday(day));
  let from = wh?.is_open ? hm(wh.open_time) : 9 * 60;
  let to = wh?.is_open ? hm(wh.close_time) : 19 * 60;
  for (const r of rows) {
    from = Math.min(from, minutesOf(r.starts_at));
    to = Math.max(to, minutesOf(r.ends_at) || 24 * 60);
  }
  return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60, open: wh?.is_open ?? true };
}

/** Gün takvimi: her personel bir sütun, randevular saat ızgarasında blok. Bloğa dokununca listede açılır. */
export function DayCalendar({
  day,
  rows,
  staff,
  hours,
  now,
  onSelect,
}: {
  day: string;
  rows: Row[];
  staff: Staff[];
  hours: WorkingHour[];
  now: number;
  onSelect: (id: string) => void;
}) {
  const visible = rows.filter((r) => r.status !== "cancelled");
  const { from, to, open } = range(day, hours, visible);
  const cols = [
    ...staff.map((s) => ({ id: s.id as string | null, name: s.name })),
    ...(visible.some((r) => !r.staff_id || !staff.some((s) => s.id === r.staff_id)) ? [{ id: null, name: "Atanmamış" }] : []),
  ];
  const height = ((to - from) / 60) * HOUR_PX;
  const nowMin = day === todayStr() ? minutesOf(new Date(now).toISOString()) : null;

  return (
    <div className="card overflow-hidden">
      {!open && <p className="border-b border-line bg-amber-400/10 px-4 py-2 text-sm text-warn">Bu gün çalışma saatlerinize göre kapalı.</p>}
      <div className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="grid border-b border-line bg-surface-2/60 text-sm font-medium" style={{ gridTemplateColumns: `3.5rem repeat(${cols.length}, minmax(9rem, 1fr))` }}>
            <span />
            {cols.map((c) => (
              <span key={c.id ?? "none"} className="truncate border-l border-line px-3 py-2.5">
                {c.name}
                <span className="ml-1.5 text-xs text-ink-3">{visible.filter((r) => (c.id ? r.staff_id === c.id : !staff.some((s) => s.id === r.staff_id))).length}</span>
              </span>
            ))}
          </div>
          <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${cols.length}, minmax(9rem, 1fr))`, height }}>
            {/* Saat çizgileri */}
            <div className="relative">
              {Array.from({ length: (to - from) / 60 }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-2xs tabular-nums text-ink-3" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? "" : `${String(from / 60 + i).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {cols.map((c) => (
              <div key={c.id ?? "none"} className="relative border-l border-line">
                {Array.from({ length: (to - from) / 60 }, (_, i) => (
                  <span key={i} className="absolute inset-x-0 border-t border-line" style={{ top: i * HOUR_PX }} />
                ))}
                {visible
                  .filter((r) => (c.id ? r.staff_id === c.id : !staff.some((s) => s.id === r.staff_id)))
                  .map((r) => {
                    const top = ((minutesOf(r.starts_at) - from) / 60) * HOUR_PX;
                    const h = Math.max(((minutesOf(r.ends_at) - minutesOf(r.starts_at)) / 60) * HOUR_PX, 26);
                    const color = STATUS_COLORS[r.status];
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelect(r.id)}
                        className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-xs ring-1 ring-inset transition hover:z-10 hover:brightness-125"
                        style={{
                          top: top + 1,
                          height: h - 2,
                          background: `color-mix(in oklab, ${color} 16%, var(--color-surface))`,
                          borderLeft: `3px solid ${color}`,
                          ["--tw-ring-color" as string]: `color-mix(in oklab, ${color} 35%, transparent)`,
                        }}
                        title={`${formatTime(r.starts_at)} ${r.customer_name} · ${r.service_name} · ${STATUS[r.status].label}`}
                      >
                        <span className="block truncate font-semibold text-ink">
                          {formatTime(r.starts_at)} {r.customer_name}
                        </span>
                        {h > 34 && <span className="block truncate text-ink-3">{r.service_name}</span>}
                      </button>
                    );
                  })}
              </div>
            ))}
            {nowMin !== null && nowMin >= from && nowMin <= to && (
              <div className="pointer-events-none absolute left-14 right-0 z-20 flex items-center" style={{ top: ((nowMin - from) / 60) * HOUR_PX }}>
                <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                <span className="h-px flex-1 bg-rose-500" />
              </div>
            )}
          </div>
        </div>
      </div>
      <Legend />
    </div>
  );
}

/** Hafta: Pazartesiden başlayan 7 sütun, her günün randevuları kısa satır. Gün başlığına dokununca o gün açılır. */
export function WeekView({ start, rows, onDay }: { start: string; rows: Row[]; onDay: (day: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayStr();
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="grid min-w-[52rem] grid-cols-7 divide-x divide-line">
          {days.map((d) => {
            const list = rows.filter((r) => dayOf(r.starts_at) === d && r.status !== "cancelled");
            const revenue = list.filter((r) => r.status !== "no_show").reduce((s, r) => s + Number(r.price), 0);
            return (
              <div key={d} className={d === today ? "bg-brand-400/[0.04]" : ""}>
                <button type="button" onClick={() => onDay(d)} className="block w-full border-b border-line px-3 py-2.5 text-left transition hover:bg-tint/[0.03]">
                  <span className={`block text-xs font-medium ${d === today ? "text-accent" : "text-ink-3"}`}>{formatDate(d, { day: undefined, month: undefined })}</span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums">{formatDate(d, { weekday: undefined, month: "short" })}</span>
                    <span className="text-2xs tabular-nums text-ink-3">{list.length} rnd</span>
                  </span>
                  <span className="block text-2xs tabular-nums text-ink-3">{revenue ? `₺${revenue.toLocaleString("tr-TR")}` : "—"}</span>
                </button>
                <ul className="space-y-1 p-1.5">
                  {list.slice(0, 12).map((r) => (
                    <li
                      key={r.id}
                      className="truncate rounded-md px-1.5 py-1 text-2xs"
                      style={{ background: `color-mix(in oklab, ${STATUS_COLORS[r.status]} 14%, transparent)`, borderLeft: `2px solid ${STATUS_COLORS[r.status]}` }}
                      title={`${formatTime(r.starts_at)} ${r.customer_name} · ${r.service_name}`}
                    >
                      <span className="font-semibold tabular-nums">{formatTime(r.starts_at)}</span> {r.customer_name}
                    </li>
                  ))}
                  {list.length > 12 && (
                    <li>
                      <button type="button" onClick={() => onDay(d)} className="w-full rounded-md px-1.5 py-1 text-left text-2xs text-accent hover:underline">
                        +{list.length - 12} randevu daha
                      </button>
                    </li>
                  )}
                  {list.length === 0 && <li className="px-1.5 py-3 text-center text-2xs text-ink-3">Boş</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-2xs text-ink-3">
      {(["confirmed", "pending", "completed", "no_show"] as const).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLORS[s] }} /> {STATUS[s].label}
        </span>
      ))}
    </div>
  );
}
