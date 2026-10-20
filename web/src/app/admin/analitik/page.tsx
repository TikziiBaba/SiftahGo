"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Star } from "lucide-react";
import { CsvButton, Empty, PageTitle, Section, Skeleton, Tabs, shortDate } from "@/components/admin/ui";
import { MigrationBanner, PeriodPicker, periodText, useDashboard, usePeriod } from "@/components/admin/period";
import { BRAND, BarList, Donut, Heatmap, SERIES } from "@/components/charts";
import { categoryLabel } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/format";
import type { AdminDashboard } from "@/lib/admin-types";

const n = (x: number) => new Intl.NumberFormat("tr-TR").format(Math.round(x));

export default function AnalyticsPage() {
  const { from, to } = usePeriod();
  const dash = useDashboard(from, to);
  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Analitik" hint={`${periodText(from, to)} · pazar, müşteri davranışı ve tutma`}>
        <PeriodPicker />
      </PageTitle>
      {!dash ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : dash.error ? (
        <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-bad">{dash.error}</p>
      ) : !dash.data ? (
        <div className="mt-6">
          <MigrationBanner />
        </div>
      ) : (
        <Body d={dash.data} />
      )}
    </div>
  );
}

function Body({ d }: { d: AdminDashboard }) {
  const [geo, setGeo] = useState<"category" | "city">("category");
  const [cohort, setCohort] = useState<"business" | "customer">("business");
  const rows = geo === "category" ? d.by_category : d.by_city;
  const totalAppts = rows.reduce((s, r) => s + r.appointments, 0);
  const lead = d.lead_time;
  const leadTotal = lead.h2 + lead.same_day + lead.d3 + lead.d7 + lead.more;
  const revenueBySource = useMemo(() => {
    const paytr = d.revenue_by_plan.filter((r) => r.source === "paytr").reduce((s, r) => s + Number(r.amount), 0);
    const admin = d.revenue_by_plan.filter((r) => r.source === "admin").reduce((s, r) => s + Number(r.amount), 0);
    return { paytr, admin };
  }, [d.revenue_by_plan]);
  const e = d.engagement;

  return (
    <>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Section title="Randevu yoğunluğu (gün × saat)">
          <Heatmap title="Gün ve saate göre randevu yoğunluğu" cells={d.heatmap} from={7} to={23} />
        </Section>
        <Section title="Ne kadar önceden randevu alınıyor?">
          <p className="mt-1 text-xs text-ink-3">Müşterinin kendi aldığı {n(leadTotal)} randevu</p>
          <BarList
            items={[
              { name: "2 saatten az", value: lead.h2 },
              { name: "Aynı gün", value: lead.same_day },
              { name: "1–3 gün", value: lead.d3 },
              { name: "3–7 gün", value: lead.d7 },
              { name: "1 haftadan fazla", value: lead.more },
            ]}
            format={(x) => `${n(x)} · %${leadTotal ? Math.round((x / leadTotal) * 100) : 0}`}
          />
        </Section>
      </div>

      <Section
        title="Kategori ve şehir kırılımı"
        className="mt-4"
        action={
          <div className="flex items-center gap-2">
            <Tabs value={geo} onChange={setGeo} options={[{ id: "category", label: "Kategori" }, { id: "city", label: "Şehir" }]} />
            <CsvButton
              filename={`${geo === "category" ? "kategoriler" : "sehirler"}-${d.from}-${d.to}`}
              rows={rows.map((r) => ({ ad: geo === "category" ? categoryLabel(r.key) : r.key, isletme: r.businesses, randevu: r.appointments, ciro: Number(r.gmv) }))}
            />
          </div>
        }
      >
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">{geo === "category" ? "Kategori" : "Şehir"}</th>
                <th className="py-2 text-right font-medium">İşletme</th>
                <th className="py-2 text-right font-medium">Randevu</th>
                <th className="w-40 py-2 pl-4 font-medium">Pay</th>
                <th className="py-2 text-right font-medium">Ciro (GMV)</th>
                <th className="py-2 text-right font-medium">İşletme başı</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line/60">
                  <td className="py-2.5">{geo === "category" ? categoryLabel(r.key) : r.key}</td>
                  <td className="py-2.5 text-right tabular-nums">{n(r.businesses)}</td>
                  <td className="py-2.5 text-right tabular-nums">{n(r.appointments)}</td>
                  <td className="py-2.5 pl-4">
                    <div className="h-1.5 rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full" style={{ width: `${totalAppts ? (r.appointments / totalAppts) * 100 : 0}%`, background: BRAND }} />
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatPrice(Number(r.gmv))}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-3">{r.businesses ? n(r.appointments / r.businesses) : "—"} rnd</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>Veri yok.</Empty>}
        </div>
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="En çok randevu alan işletmeler">
          {d.top_businesses.length === 0 ? (
            <Empty>Bu dönemde randevu yok.</Empty>
          ) : (
            <ol className="mt-3 space-y-1">
              {d.top_businesses.map((b, i) => (
                <li key={b.id}>
                  <Link href={`/admin/isletmeler/${b.id}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-tint/[0.04]">
                    <span className="text-center text-xs font-semibold tabular-nums text-ink-3">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-ink-3">
                        {categoryLabel(b.category)} · {b.city || "—"} ·
                        <Star className="size-3 fill-amber-400 text-amber-400" /> {Number(b.rating_avg).toFixed(1)} ({b.rating_count})
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{n(b.appointments)} rnd</span>
                      <span className="block text-xs tabular-nums text-ink-3">
                        {formatPrice(Number(b.gmv))} · {n(b.customers)} müşteri
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section title="Risk altındaki işletmeler" action={<span className="text-2xs text-ink-3">Yayında, 30 gündür randevusuz</span>}>
          {d.at_risk.length === 0 ? (
            <Empty>Risk altında işletme yok.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {d.at_risk.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/isletmeler/${b.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent">
                    <AlertTriangle className="size-4 shrink-0 text-warn" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{b.name}</span>
                      <span className="block text-xs text-ink-3">
                        {b.trial ? "Denemede" : "Ücretli"} · bitiş {shortDate(b.subscription_ends_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-ink-3">{b.last_booking ? `son randevu ${shortDate(b.last_booking)}` : "hiç randevu yok"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Tutma (kohort)"
        className="mt-4"
        action={<Tabs value={cohort} onChange={setCohort} options={[{ id: "business", label: "İşletmeler" }, { id: "customer", label: "Müşteriler" }]} />}
      >
        <p className="mt-1 text-xs text-ink-3">
          {cohort === "business"
            ? "Kayıt ayına göre işletmelerin sonraki aylarda randevu alan yüzdesi."
            : "Kayıt ayına göre müşterilerin sonraki aylarda randevu oluşturan yüzdesi."}
        </p>
        <Cohort rows={cohort === "business" ? d.cohorts : d.customer_cohorts} />
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Gelir kırılımı (dönem)">
          <Donut
            title="Gelir kaynağı"
            items={[
              { label: "PayTR (kart)", value: revenueBySource.paytr, color: SERIES[0] },
              { label: "Yönetici tanımladı", value: revenueBySource.admin, color: SERIES[1] },
            ]}
            format={formatPrice}
          />
          <ul className="mt-4 space-y-1.5 text-sm">
            {d.revenue_by_plan.map((r) => (
              <li key={`${r.plan_id}-${r.months}-${r.source}`} className="flex justify-between gap-2">
                <span className="text-ink-2">
                  {r.name} · {r.months === 12 ? "yıllık" : "aylık"}
                  {r.source === "admin" && " · yönetici"}
                </span>
                <span className="tabular-nums">
                  {n(r.count)} × · <b>{formatPrice(Number(r.amount))}</b>
                </span>
              </li>
            ))}
            {d.revenue_by_plan.length === 0 && <li className="text-ink-3">Bu dönemde ödeme yok.</li>}
          </ul>
        </Section>
        <Section title="Puan dağılımı (dönem)">
          <Donut
            title="Puan dağılımı"
            items={(["5", "4", "3", "2", "1"] as const).map((k, i) => ({ label: `${k} yıldız`, value: d.ratings.dist[k], color: ["#0ca30c", "#5cb85c", "#fab219", "#ec835a", "#d03b3b"][i] }))}
            center={{ value: d.ratings.avg ? Number(d.ratings.avg).toFixed(2) : "—", label: `${n(d.ratings.count)} yorum` }}
          />
          <p className="mt-3 text-xs text-ink-3">
            {n(d.ratings.unanswered)} yorum cevapsız · {n(d.ratings.low)} düşük puan ·{" "}
            <Link href="/admin/yorumlar" className="text-accent hover:underline">
              Yorumlar
            </Link>
          </p>
        </Section>
        <Section title="Etkileşim (dönem)">
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            {[
              ["Favoriye ekleme", e.favorites, `toplam ${n(e.favorites_total)}`],
              ["Bekleme listesi", e.waitlist, `${n(e.waitlist_notified)} haber verildi`],
              ["Ertelenen randevu", e.rescheduled, ""],
              ["Davet ödülü", e.referral_rewarded, ""],
              ["Seans paketi", e.session_packages, ""],
              ["Engellenen müşteri", e.blocked, ""],
            ].map(([label, v, hint]) => (
              <div key={label as string} className="rounded-xl bg-surface-2 p-3">
                <dd className="text-lg font-semibold tabular-nums">{n(v as number)}</dd>
                <dt className="text-2xs text-ink-3">{label}</dt>
                {hint && <p className="text-3xs text-ink-3">{hint}</p>}
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-3">
        <ExternalLink className="size-3.5" /> Rakamlar İstanbul saatine göre günlere ayrılır; GMV yalnızca tamamlanan randevuları sayar.
      </p>
    </>
  );
}

/** Kohort tablosu: satır = kayıt ayı, sütun = kaçıncı ay; hücre rengi oranla koyulaşır. */
function Cohort({ rows }: { rows: { month: string; size: number; active: number[] }[] }) {
  if (rows.every((r) => r.size === 0)) return <Empty>Son 6 ayda kayıt yok.</Empty>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[36rem] border-separate border-spacing-1 text-center text-xs">
        <thead className="text-ink-3">
          <tr>
            <th className="text-left font-medium">Kayıt ayı</th>
            <th className="font-medium">Kişi</th>
            {Array.from({ length: 6 }, (_, i) => (
              <th key={i} className="font-medium">
                {i === 0 ? "Aynı ay" : `${i}. ay`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td className="whitespace-nowrap text-left text-ink-2">{formatDate(r.month, { weekday: undefined, day: undefined, month: "long", year: "numeric" })}</td>
              <td className="tabular-nums">{n(r.size)}</td>
              {Array.from({ length: 6 }, (_, i) => {
                const v = r.active[i];
                if (v === undefined) return <td key={i} />;
                const ratio = r.size ? v / r.size : 0;
                return (
                  <td
                    key={i}
                    className="rounded-md px-2 py-2 tabular-nums"
                    style={{ background: r.size ? `color-mix(in oklab, ${BRAND} ${10 + ratio * 80}%, var(--color-surface))` : "var(--color-surface-2)" }}
                    title={`${n(v)} / ${n(r.size)}`}
                  >
                    {r.size ? `%${Math.round(ratio * 100)}` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
