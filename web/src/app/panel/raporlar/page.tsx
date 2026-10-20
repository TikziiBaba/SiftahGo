"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Gauge, Percent, Repeat, ShoppingBag, Smartphone, UserX, Wallet, XCircle } from "lucide-react";
import { CsvButton } from "@/components/admin/ui";
import { AreaChart, BarChart, BarList, Donut, Heatmap, KpiCard, STATUS_COLORS } from "@/components/charts";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import { addDays, dayBounds, dayOf, formatDate, formatPrice, formatTime, isoWeekday, phoneKey, todayStr } from "@/lib/format";
import type { AppointmentStatus, ReportSummary } from "@/lib/types";

type Row = {
  starts_at: string;
  created_at: string;
  status: AppointmentStatus;
  price: number;
  service_name: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  staff: { name: string } | null;
};

const PERIODS = [
  { id: "7", label: "Son 7 gün" },
  { id: "30", label: "Son 30 gün" },
  { id: "month", label: "Bu ay" },
  { id: "last-month", label: "Geçen ay" },
  { id: "90", label: "Son 90 gün" },
  { id: "365", label: "Son 1 yıl" },
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

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 864e5);
// İptal ve gelmeyenler ciroya sayılmaz.
const counts = (r: Row) => r.status !== "cancelled" && r.status !== "no_show";
const ratio = (a: number, b: number) => (b ? a / b : 0);
const pctText = (n: number) => `%${Math.round(n * 100)}`;

function summarize(rows: Row[]) {
  const valid = rows.filter(counts);
  const completed = rows.filter((r) => r.status === "completed").length;
  const noShow = rows.filter((r) => r.status === "no_show").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const revenue = valid.reduce((s, r) => s + Number(r.price), 0);
  return {
    revenue,
    count: valid.length,
    average: ratio(revenue, valid.length),
    noShowRate: ratio(noShow, completed + noShow),
    cancelRate: ratio(cancelled, rows.length),
    online: ratio(rows.filter((r) => r.customer_id).length, rows.length),
    cancelled,
  };
}

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
  const [result, setResult] = useState<{ period: string; rows: Row[]; prev: Row[]; summary: ReportSummary | null; prevSummary: ReportSummary | null } | null>(null);
  const { from, to } = range(period);
  const length = daysBetween(from, to) + 1;
  const prevFrom = addDays(from, -length);
  const prevTo = addDays(from, -1);
  const data = result?.period === period ? result : null;

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("appointments")
        .select("starts_at, created_at, status, price, service_name, customer_id, customer_name, customer_phone, staff(name)")
        .eq("business_id", business.id)
        .gte("starts_at", dayBounds(prevFrom).from)
        .lt("starts_at", dayBounds(to).to)
        .limit(10000),
      supabase.rpc("get_report_summary", { p_business_id: business.id, p_from: from, p_to: to }),
      supabase.rpc("get_report_summary", { p_business_id: business.id, p_from: prevFrom, p_to: prevTo }),
    ]).then(([{ data }, { data: summary }, { data: prevSummary }]) => {
      if (!active) return;
      const all = (data ?? []) as unknown as Row[];
      const cut = dayBounds(from).from;
      setResult({
        period,
        rows: all.filter((r) => r.starts_at >= cut),
        prev: all.filter((r) => r.starts_at < cut),
        summary: (summary ?? null) as ReportSummary | null,
        prevSummary: (prevSummary ?? null) as ReportSummary | null,
      });
    });
    return () => {
      active = false;
    };
  }, [business.id, period, from, to, prevFrom, prevTo]);

  const view = useMemo(() => {
    if (!data) return null;
    const cur = summarize(data.rows);
    const prev = summarize(data.prev);
    const valid = data.rows.filter(counts);
    const dayList: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) dayList.push(d);
    const sumBy = (rows: Row[], day: string) => rows.filter((r) => counts(r) && dayOf(r.starts_at) === day).reduce((s, r) => s + Number(r.price), 0);
    const daily = dayList.map((d, i) => ({
      label: formatDate(d, { weekday: undefined, month: "short" }),
      value: sumBy(data.rows, d),
      compare: sumBy(data.prev, addDays(prevFrom, i)),
    }));
    const dailyCount = dayList.map((d) => ({ label: formatDate(d, { weekday: undefined, month: "short" }), value: valid.filter((r) => dayOf(r.starts_at) === d).length }));

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
    const customers = (() => {
      const map = new Map<string, { name: string; count: number; revenue: number }>();
      for (const r of valid) {
        const k = phoneKey(r.customer_phone) || r.customer_name;
        const g = map.get(k) ?? { name: r.customer_name, count: 0, revenue: 0 };
        g.count += 1;
        g.revenue += Number(r.price);
        map.set(k, g);
      }
      return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
    })();

    const heat = new Map<string, number>();
    for (const r of valid) {
      const d = isoWeekday(dayOf(r.starts_at));
      const h = Number(formatTime(r.starts_at).slice(0, 2));
      heat.set(`${d}-${h}`, (heat.get(`${d}-${h}`) ?? 0) + 1);
    }
    const lead = { "2 saatten az": 0, "Aynı gün": 0, "1–3 gün": 0, "3–7 gün": 0, "1 haftadan fazla": 0 };
    for (const r of data.rows.filter((x) => x.customer_id)) {
      const h = (new Date(r.starts_at).getTime() - new Date(r.created_at).getTime()) / 36e5;
      lead[h < 2 ? "2 saatten az" : h < 24 ? "Aynı gün" : h < 72 ? "1–3 gün" : h < 168 ? "3–7 gün" : "1 haftadan fazla"] += 1;
    }
    const statusItems = (Object.keys(STATUS) as AppointmentStatus[]).map((s) => ({
      label: STATUS[s].label,
      value: data.rows.filter((r) => r.status === s).length,
      color: STATUS_COLORS[s],
    }));
    return {
      cur,
      prev,
      daily,
      dailyCount,
      byService: group((r) => r.service_name),
      byStaff: group((r) => r.staff?.name ?? "Atanmamış"),
      customers,
      heat: [...heat.entries()].map(([k, c]) => {
        const [d, h] = k.split("-").map(Number);
        return { d, h, c };
      }),
      lead: Object.entries(lead).map(([name, value]) => ({ name, value })),
      statusItems,
    };
  }, [data, from, to, prevFrom]);

  const occupancy = (s: ReportSummary | null) => (s?.capacity_minutes ? s.booked_minutes / s.capacity_minutes : 0);
  const returning = (s: ReportSummary | null) => (s?.customers ? s.returning / s.customers : 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Raporlar</h1>
          <p className="text-sm text-ink-3">
            {formatDate(from, { weekday: undefined })} – {formatDate(to, { weekday: undefined })} · önceki {length} günle karşılaştırılır · iptal ve gelmeyenler ciroya dahil değil
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-full [scrollbar-width:none] bg-surface p-1 ring-1 ring-line">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${period === p.id ? "bg-brand-400/15 text-accent" : "text-ink-3 hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <CsvButton
            filename={`randevular-${from}-${to}`}
            rows={(data?.rows ?? []).map((r) => ({
              tarih: formatDate(r.starts_at, { weekday: undefined, year: "numeric" }),
              saat: formatTime(r.starts_at),
              musteri: r.customer_name,
              telefon: r.customer_phone,
              hizmet: r.service_name,
              personel: r.staff?.name ?? "",
              tutar: Number(r.price),
              durum: STATUS[r.status].label,
              kanal: r.customer_id ? "Online" : "Elle",
            }))}
          />
        </div>
      </div>

      {!view ? (
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Ciro" icon={Wallet} value={formatPrice(view.cur.revenue)} cur={view.cur.revenue} prev={view.prev.revenue} spark={view.daily.map((d) => d.value)} />
            <KpiCard label="Randevu" icon={CalendarCheck} value={String(view.cur.count)} cur={view.cur.count} prev={view.prev.count} spark={view.dailyCount.map((d) => d.value)} />
            <KpiCard label="Ortalama sepet" icon={ShoppingBag} value={formatPrice(view.cur.average)} cur={view.cur.average} prev={view.prev.average} />
            <KpiCard
              label="Doluluk"
              icon={Gauge}
              value={pctText(occupancy(data!.summary))}
              cur={occupancy(data!.summary)}
              prev={occupancy(data!.prevSummary)}
              hint="Personel saatlerinin dolu kısmı"
            />
            <KpiCard
              label="Geri dönen müşteri"
              icon={Repeat}
              value={pctText(returning(data!.summary))}
              cur={returning(data!.summary)}
              prev={returning(data!.prevSummary)}
              hint={`${data!.summary?.customers ?? 0} müşteriden ${data!.summary?.returning ?? 0} kişi`}
            />
            <KpiCard label="Gelmeme oranı" icon={UserX} value={pctText(view.cur.noShowRate)} cur={view.cur.noShowRate} prev={view.prev.noShowRate} invert tone={view.cur.noShowRate > 0.1 ? "warn" : undefined} />
            <KpiCard label="İptal oranı" icon={XCircle} value={pctText(view.cur.cancelRate)} cur={view.cur.cancelRate} prev={view.prev.cancelRate} invert hint={`${view.cur.cancelled} iptal`} />
            <KpiCard label="Online randevu payı" icon={Smartphone} value={pctText(view.cur.online)} cur={view.cur.online} prev={view.prev.online} hint="Müşterinin kendi aldığı" />
          </div>

          <section className="card mt-4 p-5">
            <h2 className="font-semibold">Günlük ciro</h2>
            <AreaChart title="Günlük ciro" data={view.daily} format={formatPrice} compareLabel={`Önceki ${length} gün`} />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="card p-5">
              <h2 className="font-semibold">Günlük randevu sayısı</h2>
              <BarChart title="Günlük randevu sayısı" data={view.dailyCount} format={(n) => `${Math.round(n)}`} />
            </section>
            <section className="card p-5">
              <h2 className="font-semibold">Randevu durumları</h2>
              <Donut title="Randevu durumları" items={view.statusItems} center={{ value: String(data!.rows.length), label: "randevu" }} />
            </section>
          </div>

          <section className="card mt-4 p-5">
            <h2 className="font-semibold">En yoğun gün ve saatler</h2>
            <p className="text-sm text-ink-3">Personel planını ve kampanya saatlerini buna göre ayarlayın.</p>
            <Heatmap title="Gün ve saate göre randevu yoğunluğu" cells={view.heat} />
          </section>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-semibold">Hizmetlere göre ciro</h2>
              <BarList items={view.byService.slice(0, 8).map((g) => ({ name: g.name, value: g.revenue, hint: `${g.count} randevu` }))} format={formatPrice} />
            </section>
            <section className="card p-5">
              <h2 className="font-semibold">Personele göre ciro</h2>
              <BarList items={view.byStaff.slice(0, 8).map((g) => ({ name: g.name, value: g.revenue, hint: `${g.count} randevu` }))} format={formatPrice} />
            </section>
            <section className="card p-5">
              <h2 className="font-semibold">En değerli müşteriler</h2>
              <BarList items={view.customers.map((g) => ({ name: g.name, value: g.revenue, hint: `${g.count} kez` }))} format={formatPrice} empty="Bu dönemde müşteri yok." />
            </section>
            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Percent className="size-4 text-accent" /> Ne kadar önceden randevu alınıyor?
              </h2>
              <BarList items={view.lead} format={(n) => `${n}`} empty="Bu dönemde online randevu yok." />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
