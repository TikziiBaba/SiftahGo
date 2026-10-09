"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CsvButton, dateTime, Empty, isAdminPayment, PageTitle, PAYMENT_STATUS, Skeleton, Tabs, Tile } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatPrice } from "@/lib/format";
import type { Payment, Plan } from "@/lib/types";

type Row = Payment & { business_id: string; businesses: { name: string; slug: string } | null };

const STATUSES = [
  { id: "all", label: "Tümü" },
  { id: "paid", label: "Ödendi" },
  { id: "pending", label: "Yarım kaldı" },
  { id: "failed", label: "Başarısız" },
] as const;
type Status = (typeof STATUSES)[number]["id"];

const PERIODS = [
  { id: "30", label: "Son 30 gün" },
  { id: "90", label: "Son 90 gün" },
  { id: "365", label: "Son 1 yıl" },
  { id: "all", label: "Tüm zamanlar" },
];

export default function AdminPayments() {
  const params = useSearchParams();
  const [data, setData] = useState<{ rows: Row[]; plans: Plan[]; now: number } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>(() => (STATUSES.some((s) => s.id === params.get("durum")) ? (params.get("durum") as Status) : "all"));
  const [source, setSource] = useState<"" | "paytr" | "admin">("");
  const [period, setPeriod] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("payments").select("*, businesses(name, slug)").order("created_at", { ascending: false }).limit(5000),
      supabase.from("plans").select("*"),
    ]).then(([p, pl]) => {
      if (p.error) return setError(errorMessage(p.error));
      setData({ rows: (p.data ?? []) as Row[], plans: (pl.data ?? []) as Plan[], now: Date.now() });
    });
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const from = period === "all" ? "" : new Date(data.now - Number(period) * 864e5).toISOString();
    const term = q.trim().toLocaleLowerCase("tr-TR");
    const inScope = data.rows
      .filter((p) => !from || p.created_at >= from)
      .filter((p) => !source || (source === "admin") === isAdminPayment(p.merchant_oid))
      .filter((p) => !term || [p.businesses?.name, p.merchant_oid].some((v) => v?.toLocaleLowerCase("tr-TR").includes(term)));
    const list = inScope.filter((p) => status === "all" || p.status === status);
    const paid = inScope.filter((p) => p.status === "paid");
    return {
      list,
      counts: Object.fromEntries(STATUSES.map((s) => [s.id, s.id === "all" ? inScope.length : inScope.filter((p) => p.status === s.id).length])),
      total: paid.reduce((s, p) => s + Number(p.amount), 0),
      paytr: paid.filter((p) => !isAdminPayment(p.merchant_oid)).reduce((s, p) => s + Number(p.amount), 0),
      admin: paid.filter((p) => isAdminPayment(p.merchant_oid)),
      paidCount: paid.length,
      conversion: inScope.length ? Math.round((paid.length / inScope.length) * 100) : 0,
    };
  }, [data, status, source, period, q]);

  if (error) return <p className="mx-auto max-w-6xl rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;
  const planName = (id: string) => data?.plans.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Ödemeler" hint="PayTR ödemeleri ve yöneticinin tanımladığı paketler">
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Dönem">
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <CsvButton
          filename="odemeler"
          rows={(view?.list ?? []).map((p) => ({
            Tarih: p.paid_at ?? p.created_at,
            İşletme: p.businesses?.name ?? "",
            Paket: planName(p.plan_id),
            Tutar: Number(p.amount),
            Durum: PAYMENT_STATUS[p.status].label,
            Kaynak: isAdminPayment(p.merchant_oid) ? "Yönetici" : "PayTR",
            "Ödeme no": p.merchant_oid,
          }))}
        />
      </PageTitle>

      {view && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Tahsilat" value={formatPrice(view.total)} hint={`${view.paidCount} başarılı ödeme`} />
          <Tile label="PayTR" value={formatPrice(view.paytr)} />
          <Tile label="Yönetici tanımlı" value={String(view.admin.length)} hint={`${formatPrice(view.admin.reduce((s, p) => s + Number(p.amount), 0))} elden/havale`} />
          <Tile label="Tamamlanma oranı" value={`%${view.conversion}`} hint="Başlatılan ödemelerden" tone={view.conversion < 50 && view.counts.all > 3 ? "warn" : undefined} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Tabs value={status} onChange={setStatus} options={STATUSES.map((s) => ({ ...s, count: view?.counts[s.id] }))} />
        <select className="input w-auto" value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Kaynak">
          <option value="">Tüm kaynaklar</option>
          <option value="paytr">PayTR</option>
          <option value="admin">Yönetici</option>
        </select>
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
          <input className="input pl-9" placeholder="İşletme veya ödeme no…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {!view ? (
        <Skeleton className="mt-4 h-96" />
      ) : view.list.length === 0 ? (
        <div className="card mt-4">
          <Empty>Bu filtreye uyan ödeme yok.</Empty>
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">İşletme</th>
                <th className="px-4 py-3 font-medium">Paket</th>
                <th className="px-4 py-3 text-right font-medium">Tutar</th>
                <th className="px-4 py-3 font-medium">Kaynak</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Ödeme no</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.list.map((p) => (
                <tr key={p.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-2">{dateTime(p.paid_at ?? p.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/isletmeler/${p.business_id}`} className="hover:text-brand-300">
                      {p.businesses?.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{planName(p.plan_id)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPrice(p.amount)}</td>
                  <td className="px-4 py-3 text-ink-2">{isAdminPayment(p.merchant_oid) ? "Yönetici" : "PayTR"}</td>
                  <td className="px-4 py-3">
                    <span className={`chip ${PAYMENT_STATUS[p.status].className}`}>{PAYMENT_STATUS[p.status].label}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-3">{p.merchant_oid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
