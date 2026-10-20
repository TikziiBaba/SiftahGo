"use client";

import { useId, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";

// Panel ve yönetimin ortak grafikleri (koyu yüzey). Kütüphane yok: SVG + div.
// Kategorik sıra koyu yüzeyde (#0d1112) renk körlüğü denetiminden geçti; sırayı değiştirmeyin, döngüye sokmayın.
export const SERIES = ["#0d9488", "#d95926", "#3987e5", "#c98500", "#d55181", "#9085e9"] as const;
export const BRAND = "#14b8a6";
// Durum renkleri yalnızca durum için; her zaman etiketle birlikte gösterilir.
export const STATUS_COLORS: Record<string, string> = {
  completed: "#0ca30c",
  confirmed: "#3987e5",
  pending: "#fab219",
  no_show: "#d03b3b",
  cancelled: "#5d6a67",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Önceki döneme göre değişim. invert: azalması iyi olan ölçüler (iptal, gelmeme). */
export function Delta({ cur, prev, invert = false, suffix = "" }: { cur: number; prev: number; invert?: boolean; suffix?: string }) {
  if (!prev && !cur) return <span className="text-xs text-ink-3">—</span>;
  if (!prev) return <span className="chip bg-brand-400/10 px-2 text-2xs text-accent">yeni</span>;
  const change = (cur - prev) / prev;
  if (Math.abs(change) < 0.005)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-ink-3">
        <Minus className="size-3" /> aynı
      </span>
    );
  const up = change > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ${good ? "bg-emerald-400/10 text-ok" : "bg-rose-400/10 text-bad"}`}
      title="Önceki eşit uzunluktaki döneme göre"
    >
      <Icon className="size-3" />
      {Math.abs(change) >= 10 ? "10×+" : pct(Math.abs(change))}
      {suffix}
    </span>
  );
}

/** Küçük eğilim çizgisi (KPI kartında). */
export function Sparkline({ values, color = BRAND, className = "h-8 w-24" }: { values: number[]; color?: string; className?: string }) {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`);
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,32 L${pts.join(" L")} L100,32 Z`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  cur,
  prev,
  invert,
  hint,
  spark,
  tone,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  cur?: number;
  prev?: number;
  invert?: boolean;
  hint?: React.ReactNode;
  spark?: number[];
  tone?: "warn" | "bad" | "brand";
}) {
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
          {Icon && <Icon className="size-3.5" />} {label}
        </p>
        {cur !== undefined && prev !== undefined && <Delta cur={cur} prev={prev} invert={invert} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={`text-2xl font-semibold tabular-nums tracking-tight ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "brand" ? "text-accent" : ""}`}>
          {value}
        </p>
        {spark && <Sparkline values={spark} />}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

type Point = { label: string; value: number; compare?: number };

/**
 * Zaman serisi (alan + çizgi). compare: önceki dönemin aynı sıradaki değeri (kesikli çizgi, aynı eksen).
 * Fareyle/klavyeyle bir noktaya gelince dikey çizgi ve değer kutusu çıkar.
 */
export function AreaChart({
  data,
  format,
  height = 200,
  color = BRAND,
  title,
  compareLabel = "Önceki dönem",
}: {
  data: Point[];
  format: (n: number) => string;
  height?: number;
  color?: string;
  title: string;
  compareLabel?: string;
}) {
  const gid = useId();
  const [active, setActive] = useState<number | null>(null);
  if (data.length === 0) return <EmptyChart height={height} />;
  const hasCompare = data.some((d) => d.compare !== undefined);
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.value, d.compare ?? 0)), 1));
  const x = (i: number) => (data.length === 1 ? 50 : (i / (data.length - 1)) * 100);
  const y = (v: number) => 100 - (v / max) * 100;
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" L");
  const cmp = hasCompare ? data.map((d, i) => `${x(i)},${y(d.compare ?? 0)}`).join(" L") : "";
  const shown = active !== null ? data[active] : null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure className="mt-3" aria-label={title}>
      <div className="flex h-5 items-center justify-between gap-2 text-sm" aria-live="polite">
        {shown ? (
          <p className="text-ink-2">
            <b className="text-ink">{shown.label}</b> · {format(shown.value)}
            {shown.compare !== undefined && <span className="text-ink-3"> · önceki {format(shown.compare)}</span>}
          </p>
        ) : (
          <p className="text-ink-3">
            Toplam <b className="text-ink">{format(total)}</b>
          </p>
        )}
        {hasCompare && (
          <p className="flex shrink-0 items-center gap-3 text-xs text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: color }} /> Bu dönem
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-ink-3" /> {compareLabel}
            </span>
          </p>
        )}
      </div>
      {/* Sol boşlukta eksen değerleri; çizim alanı onların sağında (etiket işaretin üstüne binmez). */}
      <div className="relative ml-14 mt-3" style={{ height }}>
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: `${(1 - f) * 100}%` }}>
            <span className="w-full border-t border-dashed border-line" />
            <span className="absolute -left-14 -top-2 w-12 truncate text-right text-3xs tabular-nums text-ink-3">{format(max * f)}</span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M0,100 L${line} L100,100 Z`} fill={`url(#${gid})`} />
          {hasCompare && (
            <path d={`M${cmp}`} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          <path d={`M${line}`} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1="0" y2="100" stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {active !== null && (
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
            style={{ left: `${x(active)}%`, top: `${y(data[active].value)}%`, background: color }}
          />
        )}
        {/* Görünmez dokunma alanları: işaretten geniş */}
        <div className="absolute inset-0 flex" onMouseLeave={() => setActive(null)}>
          {data.map((d, i) => (
            <button
              key={i}
              type="button"
              className="h-full min-w-0 flex-1 outline-none focus-visible:bg-tint/[0.04]"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${d.label}: ${format(d.value)}`}
            />
          ))}
        </div>
      </div>
      <div className="ml-14 mt-1.5 flex justify-between text-2xs text-ink-3">
        <span>{data[0].label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)].label}</span>}
        <span>{data[data.length - 1].label}</span>
      </div>
      <TableFallback head={["Gün", "Değer", ...(hasCompare ? ["Önceki"] : [])]} rows={data.map((d) => [d.label, format(d.value), ...(hasCompare ? [format(d.compare ?? 0)] : [])])} />
    </figure>
  );
}

/** Dikey çubuklar (günlük adetler). Çubuklar arası 2px boşluk, üst köşeler yuvarlak. */
export function BarChart({
  data,
  format,
  height = 160,
  color = BRAND,
  title,
}: {
  data: Point[];
  format: (n: number) => string;
  height?: number;
  color?: string;
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (data.length === 0) return <EmptyChart height={height} />;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const shown = active !== null ? data[active] : null;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure className="mt-3" aria-label={title}>
      <p className="h-5 text-sm text-ink-3" aria-live="polite">
        {shown ? (
          <span className="text-ink-2">
            <b className="text-ink">{shown.label}</b> · {format(shown.value)}
          </span>
        ) : (
          <>
            Toplam <b className="text-ink">{format(total)}</b>
          </>
        )}
      </p>
      <div className="relative ml-14 mt-3" style={{ height }}>
        {[1, 0.5].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: `${(1 - f) * 100}%` }}>
            <span className="w-full border-t border-dashed border-line" />
            <span className="absolute -left-14 -top-2 w-12 truncate text-right text-3xs tabular-nums text-ink-3">{format(max * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-line-strong" onMouseLeave={() => setActive(null)}>
          {data.map((d, i) => (
            <button
              key={i}
              type="button"
              className="group flex h-full min-w-0 flex-1 items-end outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${d.label}: ${format(d.value)}`}
            >
              <span
                className="block w-full rounded-t-[4px] transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-brand-400"
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, background: color, opacity: active === null || active === i ? 1 : 0.45 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="ml-14 mt-1.5 flex justify-between text-2xs text-ink-3">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
      <TableFallback head={["Gün", "Değer"]} rows={data.map((d) => [d.label, format(d.value)])} />
    </figure>
  );
}

/** Halka grafik + açıklama listesi (etiket, sayı, yüzde): renk tek başına anlam taşımaz. */
export function Donut({
  items,
  format = (n) => n.toLocaleString("tr-TR"),
  center,
  title,
}: {
  items: { label: string; value: number; color: string }[];
  format?: (n: number) => string;
  center?: { value: string; label: string };
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <EmptyChart height={160} />;
  const R = 42;
  const C = 2 * Math.PI * R;
  const gap = items.filter((i) => i.value > 0).length > 1 ? 1.2 : 0;
  // Her dilimin başladığı nokta (önceki dilimlerin toplam uzunluğu).
  const starts = items.map((_, i) => items.slice(0, i).reduce((s, it) => s + (it.value / total) * C, 0));
  return (
    <figure className="mt-3 flex flex-wrap items-center gap-6" aria-label={title}>
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
          {items.map((it, i) => {
            const len = (it.value / total) * C;
            if (it.value <= 0) return null;
            return (
              <circle
                key={it.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={it.color}
                strokeWidth={active === i ? 14 : 12}
                strokeDasharray={`${Math.max(len - gap, 0)} ${C}`}
                strokeDashoffset={-starts[i]}
                className="transition-[stroke-width] duration-200"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xl font-semibold tabular-nums">{active !== null ? format(items[active].value) : center?.value ?? format(total)}</p>
            <p className="text-2xs text-ink-3">{active !== null ? items[active].label : center?.label ?? "Toplam"}</p>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li
            key={it.label}
            className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-colors ${active === i ? "bg-tint/[0.05]" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{it.label}</span>
            <span className="tabular-nums font-medium">{format(it.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-ink-3">{pct(it.value / total)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const WEEK = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** Gün × saat yoğunluğu: tek renk tonu, açıktan koyuya (az → çok). */
export function Heatmap({ cells, from = 8, to = 22, title }: { cells: { d: number; h: number; c: number }[]; from?: number; to?: number; title: string }) {
  const [active, setActive] = useState<{ d: number; h: number; c: number } | null>(null);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const map = new Map(cells.map((c) => [`${c.d}-${c.h}`, c.c]));
  const max = Math.max(...cells.map((c) => c.c), 1);
  const busiest = cells.reduce((b, c) => (c.c > (b?.c ?? 0) ? c : b), null as (typeof cells)[number] | null);
  const fill = (c: number) => (c === 0 ? "var(--color-surface-2)" : `color-mix(in oklab, ${BRAND} ${18 + (c / max) * 82}%, var(--color-surface))`);
  return (
    <figure className="mt-3" aria-label={title}>
      <p className="h-5 text-sm text-ink-3" aria-live="polite">
        {active ? (
          <span className="text-ink-2">
            <b className="text-ink">
              {WEEK[active.d - 1]} {String(active.h).padStart(2, "0")}:00
            </b>{" "}
            · {active.c} randevu
          </span>
        ) : busiest ? (
          <>
            En yoğun: <b className="text-ink">{WEEK[busiest.d - 1]} {String(busiest.h).padStart(2, "0")}:00</b> ({busiest.c})
          </>
        ) : (
          "Veri yok"
        )}
      </p>
      <div className="mt-3 overflow-x-auto">
        <div className="grid min-w-[34rem] gap-[3px]" style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }} onMouseLeave={() => setActive(null)}>
          <span />
          {hours.map((h) => (
            <span key={h} className="text-center text-3xs tabular-nums text-ink-3">
              {h % 2 === 0 ? h : ""}
            </span>
          ))}
          {WEEK.map((w, di) => (
            <div key={w} className="contents">
              <span className="self-center text-2xs text-ink-3">{w}</span>
              {hours.map((h) => {
                const c = map.get(`${di + 1}-${h}`) ?? 0;
                return (
                  <button
                    key={h}
                    type="button"
                    className="aspect-[1.6] rounded-[4px] outline-none ring-brand-300 transition-transform hover:scale-110 focus-visible:ring-2"
                    style={{ background: fill(c) }}
                    onMouseEnter={() => setActive({ d: di + 1, h, c })}
                    onFocus={() => setActive({ d: di + 1, h, c })}
                    aria-label={`${w} ${h}:00 – ${c} randevu`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-2xs text-ink-3">
        Az
        {[0.15, 0.4, 0.65, 1].map((f) => (
          <span key={f} className="h-2.5 w-5 rounded-sm" style={{ background: fill(f * max) }} />
        ))}
        Çok
      </div>
    </figure>
  );
}

/** Yatay oran çubukları (dağılım, sıralama). */
export function BarList({
  items,
  format = (n) => n.toLocaleString("tr-TR"),
  color = BRAND,
  empty = "Veri yok.",
}: {
  items: { name: string; value: number; hint?: string; href?: string }[];
  format?: (n: number) => string;
  color?: string;
  empty?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="py-8 text-center text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="mt-3 space-y-3">
      {items.map((i) => (
        <li key={i.name}>
          <div className="flex justify-between gap-2 text-sm">
            {i.href ? (
              <a href={i.href} className="truncate hover:text-accent hover:underline">
                {i.name}
              </a>
            ) : (
              <span className="truncate">{i.name}</span>
            )}
            <span className="shrink-0 tabular-nums text-ink-2">
              {i.hint && <span className="text-ink-3">{i.hint} · </span>}
              <b className="text-ink">{format(i.value)}</b>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className="h-1.5 rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Huni: her adımın bir öncekine ve başlangıca göre oranı. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = steps[0]?.value || 0;
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((s, i) => {
        const prev = i === 0 ? s.value : steps[i - 1].value;
        const w = first ? Math.max((s.value / first) * 100, s.value ? 2 : 0) : 0;
        return (
          <li key={s.label} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem_auto] items-center gap-3 text-sm">
            <span className="truncate text-ink-2">{s.label}</span>
            <div className="h-6 rounded-lg bg-surface-2">
              <div className="h-6 rounded-lg" style={{ width: `${w}%`, background: `color-mix(in oklab, ${BRAND} ${100 - i * 9}%, var(--color-surface))` }} />
            </div>
            <span className="text-right font-semibold tabular-nums">{s.value.toLocaleString("tr-TR")}</span>
            <span className="w-20 text-right text-xs tabular-nums text-ink-3">
              {i === 0 ? "başlangıç" : prev ? `${pct(s.value / prev)} geçti` : "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyChart({ height = 160 }: { height?: number }) {
  return (
    <div className="mt-3 grid place-items-center rounded-xl border border-dashed border-line text-sm text-ink-3" style={{ height }}>
      Bu dönemde veri yok
    </div>
  );
}

/** Ekran okuyucu ve kopyalama için tablo görünümü. */
function TableFallback({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs text-ink-3">
      <summary className="cursor-pointer select-none hover:text-ink">Tablo olarak göster</summary>
      <div className="mt-2 max-h-60 overflow-auto rounded-xl ring-1 ring-line">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-1 tabular-nums text-ink-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Eksenin üst sınırını okunur bir sayıya yuvarlar (1, 2, 2.5, 5 × 10^n). */
function niceMax(n: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}
