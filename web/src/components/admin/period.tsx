"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarRange, DatabaseZap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDate, todayStr } from "@/lib/format";
import type { AdminDashboard, AdminStats } from "@/lib/admin-types";

const PRESETS = [
  { id: "7", label: "7 gün" },
  { id: "30", label: "30 gün" },
  { id: "90", label: "90 gün" },
  { id: "365", label: "1 yıl" },
] as const;

const valid = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Seçili dönem adres çubuğunda: ?gun=30 ya da ?bas=YYYY-MM-DD&bit=YYYY-MM-DD (en fazla 366 gün). */
export function usePeriod() {
  const params = useSearchParams();
  const today = todayStr();
  const bas = params.get("bas");
  const bit = params.get("bit");
  if (valid(bas) && valid(bit) && bas! <= bit!) {
    const days = Math.round((Date.parse(bit!) - Date.parse(bas!)) / 864e5) + 1;
    if (days <= 366) return { from: bas!, to: bit!, days, preset: null as string | null };
  }
  const preset = PRESETS.find((p) => p.id === params.get("gun"))?.id ?? "30";
  const days = Number(preset);
  return { from: addDays(today, -(days - 1)), to: today, days, preset: preset as string | null };
}

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { from, to, preset } = usePeriod();
  const [custom, setCustom] = useState(preset === null);

  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${pathname}?${q}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-line">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setCustom(false);
              go({ gun: p.id, bas: null, bit: null });
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${preset === p.id && !custom ? "bg-brand-400/15 text-accent" : "text-ink-3 hover:text-ink"}`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${custom ? "bg-brand-400/15 text-accent" : "text-ink-3 hover:text-ink"}`}
        >
          <CalendarRange className="size-3.5" /> Özel
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-1 text-xs">
          <input type="date" className="input w-auto py-1.5 text-xs" defaultValue={from} max={to} onChange={(e) => e.target.value && go({ bas: e.target.value, bit: to, gun: null })} />
          <span className="text-ink-3">–</span>
          <input type="date" className="input w-auto py-1.5 text-xs" defaultValue={to} min={from} max={todayStr()} onChange={(e) => e.target.value && go({ bas: from, bit: e.target.value, gun: null })} />
        </div>
      )}
    </div>
  );
}

export function periodText(from: string, to: string) {
  return `${formatDate(from, { weekday: undefined, year: "numeric" })} – ${formatDate(to, { weekday: undefined, year: "numeric" })}`;
}

/**
 * admin_dashboard verisi. Fonksiyon canlıda henüz yoksa (ek SQL çalıştırılmadıysa) admin_stats'a düşer:
 * legacy = true ve yalnızca anlık sayılar dolu döner.
 */
export function useDashboard(from: string, to: string) {
  const [state, setState] = useState<{ key: string; data: AdminDashboard | null; legacy: AdminStats | null; error: string } | null>(null);
  const key = `${from}|${to}`;

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase.rpc("admin_dashboard", { p_from: from, p_to: to }).then(async ({ data, error }) => {
      if (!alive) return;
      if (!error) return setState({ key, data: data as AdminDashboard, legacy: null, error: "" });
      const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
      if (!missing) return setState({ key, data: null, legacy: null, error: error.message });
      const { data: stats, error: e2 } = await supabase.rpc("admin_stats");
      if (alive) setState({ key, data: null, legacy: (stats as AdminStats) ?? null, error: e2?.message ?? "" });
    });
    return () => {
      alive = false;
    };
  }, [from, to, key]);

  return state?.key === key ? state : null;
}

export function MigrationBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-amber-400/10 p-4 text-sm ring-1 ring-amber-400/25">
      <DatabaseZap className="mt-0.5 size-5 shrink-0 text-warn" />
      <div>
        <p className="font-semibold text-amber-200">Veritabanı güncellemesi bekleniyor</p>
        <p className="mt-0.5 text-ink-2">
          Ayrıntılı analitik için <code className="rounded bg-tint/10 px-1">supabase/migrations/20261025_guvenlik_yonetim.sql</code> dosyasını Supabase SQL
          Editor’de çalıştırın. O zamana kadar yalnızca anlık sayılar gösterilir.
        </p>
      </div>
    </div>
  );
}

export function rangeDays(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
