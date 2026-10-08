"use client";

import { useEffect, useMemo, useState } from "react";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { createClient } from "@/lib/supabase/client";
import { addDays, dayBounds, dayOf, formatDate, formatPrice, todayStr } from "@/lib/format";
import type { AppointmentStatus } from "@/lib/types";

type Row = { starts_at: string; status: AppointmentStatus; price: number; service_name: string; staff: { name: string } | null };

const PERIODS = [
  { id: "7", label: "Son 7 gün" },
  { id: "30", label: "Son 30 gün" },
  { id: "month", label: "Bu ay" },
  { id: "last-month", label: "Geçen ay" },
  { id: "90", label: "Son 90 gün" },
] as const;

function range(period: string) {
  const today = todayStr();
  if (period === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === "last-month") {
    const firstThis = `${today.slice(0, 8)}01`;
    const lastPrev = addDays(firstThis, -1);
    return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
  }
  return { from: addDays(today, -(Number(period) - 1)), to: today };
}

// İptal ve gelmeyenler ciroya sayılmaz.
const counts = (r: Row) => r.status !== "cancelled" && r.status !== "no_show";

export default function ReportsPage() {
  return (
    <PlanGate feature="reports" title="Raporlar">
      <Reports />
    </PlanGate>
  );
}

function Reports() {
  const { business } = useBusiness();
  const [period, setPeriod] = useState<string>("30");
  const [result, setResult] = useState<{ period: string; rows: Row[] } | null>(null);
  const { from, to } = range(period);
  const rows = result?.period === period ? result.rows : null;

  useEffect(() => {
    let active = true;
    createClient()
      .from("appointments")
      .select("starts_at, status, price, service_name, staff(name)")
      .eq("business_id", business.id)
      .gte("starts_at", dayBounds(from).from)
      .lt("starts_at", dayBounds(to).to)
      .limit(5000)
      .then(({ data }) => {
        if (active) setResult({ period, rows: (data ?? []) as unknown as Row[] });
      });
    return () => {
      active = false;
    };
  }, [business.id, period, from, to]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const valid = rows.filter(counts);
    const completed = rows.filter((r) => r.status === "completed").length;
    const noShow = rows.filter((r) => r.status === "no_show").length;
    const revenue = valid.reduce((s, r) => s + Number(r.price), 0);

    const days: { day: string; revenue: number; count: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push({ day: d, revenue: 0, count: 0 });
    for (const r of valid) {
      const slot = days.find((x) => x.day === dayOf(r.starts_at));
      if (slot) {
        slot.revenue += Number(r.price);
        slot.count += 1;
      }
    }

    const group = (key: (r: Row) => string) => {
      const map = new Map<string, { name: string; count: number; revenue: number }>();
      for (const r of valid) {
        const name = key(r);
        const g = map.get(name) ?? { name, count: 0, revenue: 0 };
        g.count += 1;
        g.revenue += Number(r.price);
        map.set(name, g);
      }
      return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
    };

    return {
      revenue,
      count: valid.length,
      average: valid.length ? revenue / valid.length : 0,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      noShowRate: completed + noShow ? Math.round((noShow / (completed + noShow)) * 100) : 0,
      days,
      byService: group((r) => r.service_name),
      byStaff: group((r) => r.staff?.name ?? "Atanmamış"),
    };
  }, [rows, from, to]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Raporlar</h1>
          <p className="text-sm text-ink-3">
            {formatDate(from, { weekday: undefined })} – {formatDate(to, { weekday: undefined })} · iptal ve gelmeyenler ciroya dahil değil
          </p>
        </div>
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Dönem">
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {!stats ? (
        <div className="card mt-6 h-72 animate-pulse bg-surface-2" />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Ciro" value={formatPrice(stats.revenue)} />
            <Tile label="Randevu" value={String(stats.count)} />
            <Tile label="Ortalama sepet" value={formatPrice(stats.average)} />
            <Tile label="Gelmeme oranı" value={`%${stats.noShowRate}`} hint={`${stats.cancelled} iptal`} />
          </div>

          <section className="card mt-4 p-5">
            <h2 className="font-semibold">Günlük ciro</h2>
            <DailyChart days={stats.days} />
          </section>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Breakdown title="Hizmetlere göre" items={stats.byService} />
            <Breakdown title="Personele göre" items={stats.byStaff} />
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function DailyChart({ days }: { days: { day: string; revenue: number; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const shown = active !== null ? days[active] : null;
  const short = (day: string) => formatDate(day, { weekday: undefined, month: "short" });

  if (days.every((d) => d.count === 0)) {
    return <p className="py-10 text-center text-sm text-ink-3">Bu dönemde randevu yok.</p>;
  }

  return (
    <div className="mt-3">
      <p className="h-5 text-sm text-ink-2" aria-live="polite">
        {shown ? (
          <>
            <b className="text-ink">{formatDate(shown.day)}</b> · {formatPrice(shown.revenue)} · {shown.count} randevu
          </>
        ) : (
          <span className="text-ink-3">Ayrıntı için bir güne gelin</span>
        )}
      </p>
      <div className="relative mt-3 h-44">
        {/* Hafif ızgara: üst değer ve sıfır çizgisi */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="pointer-events-none absolute -top-2.5 right-0 bg-surface pl-1 text-[11px] text-ink-3">{formatPrice(max)}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-line-strong" onMouseLeave={() => setActive(null)}>
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className="group flex h-full min-w-0 flex-1 items-end outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${formatDate(d.day)}: ${formatPrice(d.revenue)}, ${d.count} randevu`}
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${active === i ? "bg-brand-300" : "bg-brand-500"} group-focus-visible:ring-2 group-focus-visible:ring-brand-500`}
                style={{ height: `${(d.revenue / max) * 100}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{short(days[0].day)}</span>
        {days.length > 2 && <span>{short(days[Math.floor(days.length / 2)].day)}</span>}
        <span>{short(days[days.length - 1].day)}</span>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-3">Tablo olarak göster</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="py-1 font-medium">Gün</th>
              <th className="py-1 text-right font-medium">Randevu</th>
              <th className="py-1 text-right font-medium">Ciro</th>
            </tr>
          </thead>
          <tbody>
            {days.filter((d) => d.count > 0).map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1.5">{formatDate(d.day)}</td>
                <td className="py-1.5 text-right tabular-nums">{d.count}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPrice(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: { name: string; count: number; revenue: number }[] }) {
  const max = Math.max(...items.map((i) => i.revenue), 1);
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">Veri yok.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.slice(0, 8).map((i) => (
            <li key={i.name} title={`${i.name}: ${formatPrice(i.revenue)}, ${i.count} randevu`}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate">{i.name}</span>
                <span className="shrink-0 tabular-nums text-ink-2">
                  {i.count} · <b className="text-ink">{formatPrice(i.revenue)}</b>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(i.revenue / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
