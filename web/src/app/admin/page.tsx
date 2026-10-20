"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarPlus,
  CircleDollarSign,
  CreditCard,
  Gauge,
  HeartHandshake,
  Mail,
  Repeat,
  Star,
  Store,
  TrendingDown,
  UserPlus,
  UserX,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Empty, PageTitle, PAYMENT_STATUS, Section, Skeleton, dateTime, isAdminPayment, shortDate } from "@/components/admin/ui";
import { MigrationBanner, PeriodPicker, periodText, useDashboard, usePeriod } from "@/components/admin/period";
import { AreaChart, BarList, Donut, Funnel, KpiCard, SERIES, STATUS_COLORS } from "@/components/charts";
import { createClient } from "@/lib/supabase/client";
import { categoryLabel, STATUS } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/format";
import type { AdminActivity, AdminDashboard, AdminHealth, AdminStats, Pair } from "@/lib/admin-types";
import type { AppointmentStatus, Payment } from "@/lib/types";

type PaymentRow = Payment & { business_id: string; businesses: { id: string; name: string } | null };
type BizRow = { id: string; name: string; slug: string; city: string; created_at: string; subscription_ends_at: string | null; plan_id: string | null };

const n = (x: number) => new Intl.NumberFormat("tr-TR").format(Math.round(x));
const pct = (x: number) => `%${(x * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
const rate = (a: Pair, b: Pair) => ({ cur: b.cur ? a.cur / b.cur : 0, prev: b.prev ? a.prev / b.prev : 0 });

type MetricKey = "revenue" | "mrr" | "bookings" | "appointments" | "gmv" | "users" | "businesses";
const METRICS: { id: MetricKey; label: string; money?: boolean }[] = [
  { id: "revenue", label: "Tahsilat", money: true },
  { id: "mrr", label: "Aylık gelir (tahmini)", money: true },
  { id: "bookings", label: "Alınan randevu" },
  { id: "appointments", label: "Gerçekleşen randevu" },
  { id: "gmv", label: "İşletme cirosu", money: true },
  { id: "users", label: "Yeni üye" },
  { id: "businesses", label: "Yeni işletme" },
];

export default function AdminDashboardPage() {
  const { from, to } = usePeriod();
  const dash = useDashboard(from, to);
  const [side, setSide] = useState<{ payments: PaymentRow[]; expiring: BizRow[]; activity: AdminActivity[]; health: AdminHealth | null } | null>(null);
  const [metric, setMetric] = useState<MetricKey>("revenue");

  useEffect(() => {
    const supabase = createClient();
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 864e5);
    Promise.all([
      supabase.from("payments").select("*, businesses(id, name)").order("created_at", { ascending: false }).limit(8),
      supabase
        .from("businesses")
        .select("id, name, slug, city, created_at, subscription_ends_at, plan_id")
        .gt("subscription_ends_at", now.toISOString())
        .lte("subscription_ends_at", week.toISOString())
        .order("subscription_ends_at"),
      supabase.rpc("admin_activity", { p_limit: 30 }),
      fetch("/api/admin/health")
        .then((r) => (r.ok ? (r.json() as Promise<AdminHealth>) : null))
        .catch(() => null),
    ]).then(([p, e, a, h]) =>
      setSide({
        payments: (p.data ?? []) as PaymentRow[],
        expiring: (e.data ?? []) as BizRow[],
        activity: (a.data ?? []) as AdminActivity[],
        health: h,
      }),
    );
  }, []);

  const header = (
    <PageTitle title="Genel Bakış" hint={`${periodText(from, to)} · değişimler önceki eşit dönemle karşılaştırılır`}>
      <PeriodPicker />
    </PageTitle>
  );

  if (dash?.error) {
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-bad">{dash.error}</p>
      </div>
    );
  }

  if (!dash) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        {header}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const stats: Omit<AdminStats, "daily"> = dash.data?.snapshot ?? dash.legacy!;
  const alerts = [
    side?.health?.paytrTestMode && { text: "PayTR test modunda: gerçek kartlardan tahsilat yapılmıyor (Vercel > PAYTR_TEST_MODE)", href: "/admin/sistem", tone: "bad" },
    side?.health && !side.health.paytr && { text: "PayTR anahtarları tanımlı değil, online ödeme kapalı", href: "/admin/sistem", tone: "bad" },
    stats.expiring_7d > 0 && { text: `${stats.expiring_7d} işletmenin aboneliği 7 gün içinde bitiyor`, href: "/admin/isletmeler?durum=expiring", tone: "warn" },
    stats.suspended > 0 && { text: `${stats.suspended} işletme askıda`, href: "/admin/isletmeler?durum=suspended", tone: "warn" },
    stats.notifications.failed > 0 && { text: `${stats.notifications.failed} e-posta gönderilemedi`, href: "/admin/sistem", tone: "warn" },
    stats.payments_failed_30d > 0 && { text: `Son 30 günde ${stats.payments_failed_30d} başarısız ödeme`, href: "/admin/odemeler?durum=failed", tone: "warn" },
    (dash.data?.ops.errors_open ?? 0) > 0 && { text: `${dash.data!.ops.errors_open} çözülmemiş uygulama hatası`, href: "/admin/hatalar", tone: "warn" },
  ].filter(Boolean) as { text: string; href: string; tone: "bad" | "warn" }[];

  return (
    <div className="mx-auto max-w-7xl">
      {header}
      {dash.legacy && (
        <div className="mt-6">
          <MigrationBanner />
        </div>
      )}

      {alerts.length > 0 && (
        <ul className="mt-6 grid gap-2 md:grid-cols-2">
          {alerts.map((a) => (
            <li key={a.text}>
              <Link
                href={a.href}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ring-1 transition ${a.tone === "bad" ? "bg-rose-500/10 text-rose-200 ring-rose-400/25 hover:bg-rose-500/15" : "bg-amber-400/10 text-amber-200 ring-amber-400/20 hover:bg-amber-400/15"}`}
              >
                <AlertTriangle className="size-4 shrink-0" /> <span className="flex-1">{a.text}</span> <ArrowRight className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dash.data ? <Detailed d={dash.data} metric={metric} setMetric={setMetric} /> : <LegacyTiles stats={stats} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Canlı akış" className="lg:row-span-2" action={<span className="flex items-center gap-1.5 text-2xs text-ink-3"><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> son 30 olay</span>}>
          <Activity items={side?.activity ?? null} />
        </Section>
        <Section title="Süresi yaklaşanlar" action={<Link href="/admin/isletmeler?durum=expiring" className="text-xs text-accent">Tümü</Link>}>
          {!side ? (
            <Skeleton className="mt-3 h-32" />
          ) : side.expiring.length === 0 ? (
            <Empty>7 gün içinde biten abonelik yok.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {side.expiring.map((b) => (
                <BizItem key={b.id} b={b} right={shortDate(b.subscription_ends_at)} />
              ))}
            </ul>
          )}
        </Section>
        <Section title="Son ödemeler" action={<Link href="/admin/odemeler" className="text-xs text-accent">Tümü</Link>}>
          {!side ? (
            <Skeleton className="mt-3 h-32" />
          ) : side.payments.length === 0 ? (
            <Empty>Henüz ödeme yok.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {side.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/isletmeler/${p.business_id}`} className="block truncate hover:text-accent">
                      {p.businesses?.name ?? "Silinmiş işletme"}
                    </Link>
                    <p className="text-xs text-ink-3">
                      {dateTime(p.paid_at ?? p.created_at)}
                      {isAdminPayment(p.merchant_oid) && " · yönetici"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular-nums">{formatPrice(p.amount)}</p>
                    <span className={`chip mt-0.5 ${PAYMENT_STATUS[p.status].className}`}>{PAYMENT_STATUS[p.status].label}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="E-posta kuyruğu" className="lg:col-span-2">
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Bekleyen", stats.notifications.pending, ""],
              ["Hatalı", stats.notifications.failed, stats.notifications.failed ? "text-bad" : ""],
              ["Gönderilen (24 sa)", stats.notifications.sent_24h, ""],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="rounded-xl bg-surface-2 p-3">
                <p className={`text-xl font-semibold tabular-nums ${cls}`}>{n(value as number)}</p>
                <p className="text-2xs text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-3">
            <Mail className="size-3.5" /> Kuyruk dakikada bir boşaltılır (pg_cron). Ayrıntı: <Link href="/admin/sistem" className="text-accent hover:underline">Sistem durumu</Link>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Detailed({ d, metric, setMetric }: { d: AdminDashboard; metric: MetricKey; setMetric: (m: MetricKey) => void }) {
  const k = d.kpi;
  const s = d.snapshot;
  const series = (key: MetricKey) => d.daily.map((x) => Number(x[key]));
  const m = METRICS.find((x) => x.id === metric)!;
  const label = (day: string) => formatDate(day, { weekday: undefined, month: "short" });
  const cancelRate = rate(k.cancelled, k.total);
  const noShowRate = { cur: k.completed.cur + k.no_show.cur ? k.no_show.cur / (k.completed.cur + k.no_show.cur) : 0, prev: k.completed.prev + k.no_show.prev ? k.no_show.prev / (k.completed.prev + k.no_show.prev) : 0 };
  const conversion = rate(k.trial_converted, k.trial_ended);
  const online = rate(k.online_bookings, k.bookings);
  const fb = d.funnel_business;
  const fc = d.funnel_customer;
  const planItems = [
    ...s.by_plan.map((p, i) => ({ label: `${p.name} (${formatPrice(Number(p.price))})`, value: Number(p.count), color: SERIES[i % SERIES.length] })),
    { label: "Ücretsiz deneme", value: s.trial, color: "#5d6a67" },
  ];

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Aylık tekrarlayan gelir" icon={Wallet} value={formatPrice(s.mrr)} hint={`Yıllık ${formatPrice(s.mrr * 12)} · ${n(s.active)} abone`} spark={series("mrr")} tone="brand" />
        <KpiCard label="Dönem tahsilatı" icon={CircleDollarSign} value={formatPrice(k.revenue.cur)} cur={k.revenue.cur} prev={k.revenue.prev} spark={series("revenue")} hint={`PayTR ${formatPrice(k.revenue_paytr.cur)} · ${n(k.payments.cur)} ödeme`} />
        <KpiCard label="Yeni üye" icon={UserPlus} value={n(k.users.cur)} cur={k.users.cur} prev={k.users.prev} spark={series("users")} hint={`${n(k.customers.cur)} müşteri · toplam ${n(s.users)}`} />
        <KpiCard label="Yeni işletme" icon={Store} value={n(k.businesses.cur)} cur={k.businesses.cur} prev={k.businesses.prev} spark={series("businesses")} hint={`${n(k.referred.cur)} davetle · ${n(s.live)} yayında`} />
        <KpiCard label="Yeni ücretli abone" icon={BadgeCheck} value={n(k.new_paying.cur)} cur={k.new_paying.cur} prev={k.new_paying.prev} hint={`${n(s.active)} aktif · ${n(s.trial)} denemede`} />
        <KpiCard label="Alınan randevu" icon={CalendarPlus} value={n(k.bookings.cur)} cur={k.bookings.cur} prev={k.bookings.prev} spark={series("bookings")} hint={`${pct(online.cur)} online`} />
        <KpiCard label="Gerçekleşen randevu" icon={CalendarCheck} value={n(k.completed.cur)} cur={k.completed.cur} prev={k.completed.prev} spark={series("appointments")} hint={`${n(k.active_businesses.cur)} işletmede`} />
        <KpiCard label="İşletme cirosu (GMV)" icon={Gauge} value={formatPrice(k.gmv.cur)} cur={k.gmv.cur} prev={k.gmv.prev} spark={series("gmv")} hint="Tamamlanan randevular" />
        <KpiCard label="Aktif müşteri" icon={HeartHandshake} value={n(k.active_customers.cur)} cur={k.active_customers.cur} prev={k.active_customers.prev} hint={`${n(k.returning_customers.cur)} geri dönen`} />
        <KpiCard label="Denemeden dönüşüm" icon={Repeat} value={pct(conversion.cur)} cur={conversion.cur} prev={conversion.prev} hint={`${n(k.trial_converted.cur)} / ${n(k.trial_ended.cur)} deneme`} />
        <KpiCard label="İptal oranı" icon={XCircle} value={pct(cancelRate.cur)} cur={cancelRate.cur} prev={cancelRate.prev} invert hint={`${n(k.cancelled.cur)} iptal`} />
        <KpiCard label="Gelmeme oranı" icon={UserX} value={pct(noShowRate.cur)} cur={noShowRate.cur} prev={noShowRate.prev} invert tone={noShowRate.cur > 0.1 ? "warn" : undefined} />
        <KpiCard label="Kayıp abone" icon={TrendingDown} value={n(k.churned.cur)} cur={k.churned.cur} prev={k.churned.prev} invert hint={`${n(s.expired)} süresi dolmuş`} />
        <KpiCard label="Ortalama puan" icon={Star} value={k.rating.cur ? Number(k.rating.cur).toFixed(2) : "—"} cur={Number(k.rating.cur)} prev={Number(k.rating.prev)} hint={`${n(k.reviews.cur)} yorum`} />
        <KpiCard label="Başarısız ödeme" icon={CreditCard} value={n(k.failed_payments.cur)} cur={k.failed_payments.cur} prev={k.failed_payments.prev} invert hint={`${n(k.payment_attempts.cur)} deneme`} tone={k.failed_payments.cur ? "warn" : undefined} />
      </div>

      <section className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Eğilim · {m.label}</h2>
          <div className="flex gap-1 overflow-x-auto rounded-full [scrollbar-width:none] bg-surface-2 p-1">
            {METRICS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setMetric(x.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${metric === x.id ? "bg-brand-400/15 text-accent" : "text-ink-3 hover:text-ink"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <AreaChart
          key={metric}
          title={m.label}
          height={240}
          data={d.daily.map((x) => ({ label: label(x.day), value: Number(x[metric]) }))}
          format={m.money ? formatPrice : n}
        />
        {metric === "mrr" && <p className="mt-2 text-xs text-ink-3">Ödemelerin kapsadığı günlere göre hesaplanır; erken yenilemede çakışan günler iki kez sayılır.</p>}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="İşletme hunisi" action={<span className="text-2xs text-ink-3">Dönemde kayıt olanlar</span>}>
          <Funnel
            steps={[
              { label: "İşletme kaydı", value: fb.signups },
              { label: "İşletme açtı", value: fb.business },
              { label: "Hizmet ekledi", value: fb.setup },
              { label: "Yayında", value: fb.published },
              { label: "İlk randevu", value: fb.first_booking },
              { label: "İlk ödeme", value: fb.paid },
            ]}
          />
        </Section>
        <Section title="Müşteri hunisi" action={<span className="text-2xs text-ink-3">Dönemde üye olanlar</span>}>
          <Funnel
            steps={[
              { label: "Üye oldu", value: fc.signups },
              { label: "Favori ekledi", value: fc.favorited },
              { label: "Randevu aldı", value: fc.booked },
              { label: "Hizmet aldı", value: fc.completed },
              { label: "Tekrar geldi", value: fc.returned },
              { label: "Yorum yazdı", value: fc.reviewed },
            ]}
          />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Abonelikler (paket)">
          <Donut title="Paketlere göre abonelik" items={planItems} center={{ value: n(s.active + s.trial), label: "abonelik" }} />
        </Section>
        <Section title="İşletme durumu">
          <Donut
            title="İşletme durumu"
            items={[
              { label: "Ücretli aktif", value: s.active, color: STATUS_COLORS.completed },
              { label: "Denemede", value: s.trial, color: STATUS_COLORS.confirmed },
              { label: "Süresi dolmuş", value: s.expired, color: STATUS_COLORS.pending },
              { label: "Askıda", value: s.suspended, color: STATUS_COLORS.no_show },
            ]}
            center={{ value: n(s.businesses), label: "işletme" }}
          />
        </Section>
        <Section title="Randevu durumları (dönem)">
          <Donut
            title="Randevu durumları"
            items={(Object.keys(STATUS) as AppointmentStatus[]).map((st) => ({ label: STATUS[st].label, value: Number(d.status[st] ?? 0), color: STATUS_COLORS[st] }))}
          />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Kategoriler" action={<Link href="/admin/analitik" className="text-xs text-accent">Analitik</Link>}>
          <BarList items={d.by_category.slice(0, 8).map((c) => ({ name: categoryLabel(c.key), value: c.appointments, hint: `${n(c.businesses)} işletme` }))} format={(x) => `${n(x)} rnd`} />
        </Section>
        <Section title="Şehirler" action={<Link href="/admin/analitik" className="text-xs text-accent">Analitik</Link>}>
          <BarList items={d.by_city.slice(0, 8).map((c) => ({ name: c.key, value: c.appointments, hint: `${n(c.businesses)} işletme` }))} format={(x) => `${n(x)} rnd`} />
        </Section>
      </div>
    </>
  );
}

function LegacyTiles({ stats }: { stats: Omit<AdminStats, "daily"> }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard label="Aylık tekrarlayan gelir" icon={Wallet} value={formatPrice(stats.mrr)} hint={`${n(stats.active)} aktif abonelik`} />
      <KpiCard label="Tahsilat (30 gün)" icon={CircleDollarSign} value={formatPrice(stats.revenue_30d)} hint={`Toplam ${formatPrice(stats.revenue_total)}`} />
      <KpiCard label="İşletme" icon={Store} value={n(stats.businesses)} hint={`${n(stats.live)} yayında · +${n(stats.businesses_30d)} bu ay`} />
      <KpiCard label="Kullanıcı" icon={UserPlus} value={n(stats.users)} hint={`+${n(stats.users_30d)} son 30 gün`} />
      <KpiCard label="Randevu" icon={CalendarPlus} value={n(stats.appointments)} hint={`+${n(stats.appointments_30d)} son 30 gün`} />
      <KpiCard label="Yaklaşan randevu" icon={CalendarCheck} value={n(stats.upcoming)} hint="Bekleyen + onaylı" />
      <KpiCard label="İşletme cirosu (30 gün)" icon={Gauge} value={formatPrice(stats.gmv_30d)} hint="Tamamlanan randevular" />
      <KpiCard label="Değerlendirme" icon={Star} value={n(stats.reviews)} />
    </div>
  );
}

const ACTIVITY: Record<AdminActivity["kind"], { icon: LucideIcon; color: string; label: string }> = {
  user: { icon: UserPlus, color: "text-info bg-sky-400/10", label: "Üyelik" },
  business: { icon: Store, color: "text-gold bg-gold/10", label: "İşletme" },
  appointment: { icon: CalendarPlus, color: "text-accent bg-brand-400/10", label: "Randevu" },
  payment: { icon: CircleDollarSign, color: "text-ok bg-emerald-400/10", label: "Ödeme" },
  review: { icon: Star, color: "text-warn bg-amber-400/10", label: "Yorum" },
};

function Activity({ items }: { items: AdminActivity[] | null }) {
  const [now] = useState(() => Date.now());
  if (items === null) return <Skeleton className="mt-3 h-80" />;
  if (items.length === 0) return <Empty>Henüz olay yok (veya veritabanı güncellemesi bekleniyor).</Empty>;
  const ago = (iso: string) => {
    const m = Math.round((now - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${Math.max(m, 0)} dk`;
    if (m < 24 * 60) return `${Math.round(m / 60)} sa`;
    return `${Math.round(m / 1440)} g`;
  };
  return (
    <ol className="mt-3 max-h-[34rem] space-y-1 overflow-y-auto pr-1">
      {items.map((it, i) => {
        const a = ACTIVITY[it.kind];
        const href = it.kind === "user" ? `/admin/kullanicilar/${it.ref_id}` : it.ref_id ? `/admin/isletmeler/${it.ref_id}` : null;
        const body = (
          <>
            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${a.color}`}>
              <a.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{it.title}</span>
              <span className="block truncate text-xs text-ink-3">{it.detail}</span>
            </span>
            <span className="shrink-0 text-2xs tabular-nums text-ink-3">{ago(it.occurred_at)}</span>
          </>
        );
        return (
          <li key={i}>
            {href ? (
              <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-tint/[0.04]">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function BizItem({ b, right }: { b: BizRow; right: string }) {
  return (
    <li>
      <Link href={`/admin/isletmeler/${b.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-accent">
        <span className="min-w-0">
          <span className="block truncate">{b.name}</span>
          <span className="block text-xs text-ink-3">
            /{b.slug}
            {b.city && ` · ${b.city}`}
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-3">{right}</span>
      </Link>
    </li>
  );
}
