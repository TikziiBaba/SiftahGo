"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CsvButton, dateTime, Empty, PageTitle, Skeleton, Tabs, Tile } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import { addDays, dayBounds, errorMessage, formatPrice, todayStr } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";

type Row = Appointment & { businesses: { name: string } | null };

const PERIODS = [
  { id: "today", label: "Bugün", range: (t: string) => [t, t] },
  { id: "next7", label: "Gelecek 7 gün", range: (t: string) => [t, addDays(t, 6)] },
  { id: "last7", label: "Son 7 gün", range: (t: string) => [addDays(t, -6), t] },
  { id: "last30", label: "Son 30 gün", range: (t: string) => [addDays(t, -29), t] },
  { id: "last90", label: "Son 90 gün", range: (t: string) => [addDays(t, -89), t] },
] as const;

const LIMIT = 3000;

export default function AdminAppointments() {
  const [period, setPeriod] = useState<string>("last30");
  const [result, setResult] = useState<{ period: string; rows: Row[] } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [q, setQ] = useState("");
  const rows = result?.period === period ? result.rows : null;

  useEffect(() => {
    let active = true;
    const [from, to] = PERIODS.find((p) => p.id === period)!.range(todayStr());
    createClient()
      .from("appointments")
      .select("*, businesses(name)")
      .gte("starts_at", dayBounds(from).from)
      .lt("starts_at", dayBounds(to).to)
      .order("starts_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) return setError(errorMessage(error));
        setResult({ period, rows: (data ?? []) as Row[] });
      });
    return () => {
      active = false;
    };
  }, [period]);

  const view = useMemo(() => {
    if (!rows) return null;
    const term = q.trim().toLocaleLowerCase("tr-TR");
    const searched = rows.filter(
      (a) => !term || [a.businesses?.name, a.customer_name, a.customer_phone, a.customer_email, a.service_name].some((v) => v?.toLocaleLowerCase("tr-TR").includes(term)),
    );
    const by = (s: AppointmentStatus) => searched.filter((a) => a.status === s);
    return {
      list: searched.filter((a) => status === "all" || a.status === status),
      searched,
      by,
      businesses: new Set(searched.map((a) => a.business_id)).size,
      gmv: by("completed").reduce((s, a) => s + Number(a.price), 0),
      guests: searched.filter((a) => !a.customer_id).length,
    };
  }, [rows, status, q]);

  if (error) return <p className="mx-auto max-w-6xl rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Randevular" hint="Tüm işletmelerin randevuları (randevu tarihine göre)">
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Dönem">
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <CsvButton
          filename="randevular"
          rows={(view?.list ?? []).map((a) => ({
            Tarih: a.starts_at,
            İşletme: a.businesses?.name ?? "",
            Müşteri: a.customer_name,
            Telefon: a.customer_phone,
            "E-posta": a.customer_email ?? "",
            Hizmet: a.service_name,
            Tutar: Number(a.price),
            Durum: STATUS[a.status].label,
            Kanal: a.customer_id ? "Hesapla" : "Misafir/elle",
          }))}
        />
      </PageTitle>

      {view && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Randevu" value={String(view.searched.length)} hint={`${view.businesses} işletmede`} />
          <Tile label="Tamamlanan ciro" value={formatPrice(view.gmv)} hint={`${view.by("completed").length} tamamlanan`} />
          <Tile label="İptal" value={String(view.by("cancelled").length)} hint={`${view.by("no_show").length} gelmedi`} />
          <Tile label="Misafir / elle" value={String(view.guests)} hint="Hesapsız alınan" />
        </div>
      )}
      {rows?.length === LIMIT && (
        <p className="mt-3 text-xs text-amber-300">İlk {LIMIT} randevu gösteriliyor; daha kısa bir dönem seçin.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={status}
          onChange={setStatus}
          options={[
            { id: "all" as const, label: "Tümü", count: view?.searched.length },
            ...(Object.keys(STATUS) as AppointmentStatus[]).map((s) => ({ id: s, label: STATUS[s].label, count: view?.by(s).length })),
          ]}
        />
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
          <input className="input pl-9" placeholder="İşletme, müşteri, telefon, hizmet…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {!view ? (
        <Skeleton className="mt-4 h-96" />
      ) : view.list.length === 0 ? (
        <div className="card mt-4">
          <Empty>Bu dönemde randevu yok.</Empty>
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">İşletme</th>
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Hizmet</th>
                <th className="px-4 py-3 text-right font-medium">Tutar</th>
                <th className="px-4 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.list.slice(0, 500).map((a) => (
                <tr key={a.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-2">{dateTime(a.starts_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/isletmeler/${a.business_id}`} className="hover:text-brand-300">
                      {a.businesses?.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {a.customer_name}
                    <p className="text-xs text-ink-3">
                      {a.customer_phone}
                      {!a.customer_id && " · misafir"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{a.service_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPrice(a.price)}</td>
                  <td className="px-4 py-3">
                    <span className={`chip ${STATUS[a.status].className}`}>{STATUS[a.status].label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.list.length > 500 && <p className="border-t border-line px-4 py-3 text-xs text-ink-3">İlk 500 satır gösteriliyor; tamamı için CSV indirin.</p>}
        </div>
      )}
    </div>
  );
}
