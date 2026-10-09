"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { formatDate } from "@/lib/format";

/** İşletmenin yayın/abonelik durumu. `now` veri yüklenirken alınır (render sırasında saat okunmaz). */
export function businessState(
  b: { subscription_ends_at: string | null; is_suspended: boolean; is_published: boolean },
  now: number,
) {
  if (b.is_suspended) return { key: "suspended", label: "Askıda", className: TONE.rose };
  if (!b.subscription_ends_at) return { key: "never", label: "Paketsiz", className: TONE.muted };
  const days = Math.ceil((new Date(b.subscription_ends_at).getTime() - now) / 864e5);
  if (days <= 0) return { key: "expired", label: "Süresi doldu", className: TONE.amber };
  if (!b.is_published) return { key: "hidden", label: "Sahibi gizledi", className: TONE.muted };
  if (days <= 7) return { key: "expiring", label: `${days} gün kaldı`, className: TONE.amber };
  return { key: "live", label: "Yayında", className: TONE.green };
}

export const TONE = {
  green: "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20",
  amber: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20",
  rose: "bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/20",
  sky: "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20",
  brand: "bg-brand-400/10 text-brand-300 ring-1 ring-brand-400/20",
  muted: "bg-white/5 text-ink-3 ring-1 ring-line",
};

export const PAYMENT_STATUS = {
  paid: { label: "Ödendi", className: TONE.green },
  failed: { label: "Başarısız", className: TONE.rose },
  pending: { label: "Yarım kaldı", className: TONE.muted },
} as const;

/** Yönetici panelden tanımladıysa ödeme numarası "ADM" ile başlar. */
export const isAdminPayment = (oid: string) => oid.startsWith("ADM");

export function shortDate(iso: string | null | undefined) {
  return iso ? formatDate(iso, { weekday: undefined, year: "numeric", month: "short" }) : "—";
}

export function dateTime(iso: string | null | undefined) {
  return iso
    ? formatDate(iso, { weekday: undefined, year: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
}

export function PageTitle({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${
          tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Section({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-3">{children}</p>;
}

export function Skeleton({ className = "h-64" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} />;
}

/** Günlük sütun grafiği; fareyle veya klavyeyle bir güne gelince değeri gösterir. */
export function DailyBars({
  days,
  format,
  unit,
}: {
  days: { day: string; value: number }[];
  format: (n: number) => string;
  unit?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.value), 1);
  const total = days.reduce((s, d) => s + d.value, 0);
  const shown = active !== null ? days[active] : null;
  const short = (day: string) => formatDate(day, { weekday: undefined, month: "short" });

  return (
    <div className="mt-3">
      <p className="h-5 text-sm text-ink-2" aria-live="polite">
        {shown ? (
          <>
            <b className="text-ink">{formatDate(shown.day)}</b> · {format(shown.value)} {unit}
          </>
        ) : (
          <span className="text-ink-3">
            30 günde toplam <b className="text-ink">{format(total)}</b> {unit}
          </span>
        )}
      </p>
      <div className="relative mt-3 h-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-line-strong" onMouseLeave={() => setActive(null)}>
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className="group flex h-full min-w-0 flex-1 items-end outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${formatDate(d.day)}: ${format(d.value)} ${unit ?? ""}`}
            >
              <span
                className={`block w-full rounded-t-[3px] transition-colors ${active === i ? "bg-brand-300" : "bg-brand-500"} group-focus-visible:ring-2 group-focus-visible:ring-brand-500`}
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{short(days[0].day)}</span>
        <span>{short(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

/** Yatay oran çubukları (dağılımlar için). */
export function Breakdown({ items, format = String }: { items: { name: string; value: number; hint?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <Empty>Veri yok.</Empty>;
  return (
    <ul className="mt-3 space-y-3">
      {items.map((i) => (
        <li key={i.name}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate">{i.name}</span>
            <span className="shrink-0 tabular-nums text-ink-2">
              {i.hint && <span className="text-ink-3">{i.hint} · </span>}
              <b className="text-ink">{format(i.value)}</b>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Seçenek düğmeleri (filtre sekmeleri). */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-full bg-surface p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            value === o.id ? "bg-brand-400/15 text-brand-200" : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 tabular-nums text-ink-4">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Tabloyu Excel'in açabileceği CSV olarak indirir. */
export function CsvButton({ filename, rows }: { filename: string; rows: Record<string, string | number | boolean | null>[] }) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(cell).join(";"), ...rows.map((r) => headers.map((h) => cell(r[h])).join(";"))].join("\r\n");
    // BOM: Excel Türkçe karakterleri doğru okusun.
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" onClick={download} disabled={rows.length === 0} className="btn btn-secondary py-2">
      <Download className="size-4" /> CSV
    </button>
  );
}
