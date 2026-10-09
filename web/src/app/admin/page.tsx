"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Mail } from "lucide-react";
import {
  Breakdown,
  DailyBars,
  Empty,
  PageTitle,
  PAYMENT_STATUS,
  Section,
  Skeleton,
  Tile,
  dateTime,
  isAdminPayment,
  shortDate,
} from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { categoryLabel, STATUS } from "@/lib/constants";
import { errorMessage, formatPrice } from "@/lib/format";
import type { AdminStats } from "@/lib/admin-types";
import type { AppointmentStatus, Payment } from "@/lib/types";

type PaymentRow = Payment & { business_id: string; businesses: { id: string; name: string } | null };
type BizRow = { id: string; name: string; slug: string; city: string; created_at: string; subscription_ends_at: string | null; plan_id: string | null };

export default function AdminDashboard() {
  const [data, setData] = useState<{ stats: AdminStats; payments: PaymentRow[]; expiring: BizRow[]; latest: BizRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 864e5);
    Promise.all([
      supabase.rpc("admin_stats"),
      supabase.from("payments").select("*, businesses(id, name)").order("created_at", { ascending: false }).limit(8),
      supabase
        .from("businesses")
        .select("id, name, slug, city, created_at, subscription_ends_at, plan_id")
        .gt("subscription_ends_at", now.toISOString())
        .lte("subscription_ends_at", week.toISOString())
        .order("subscription_ends_at"),
      supabase.from("businesses").select("id, name, slug, city, created_at, subscription_ends_at, plan_id").order("created_at", { ascending: false }).limit(6),
    ]).then(([s, p, e, l]) => {
      if (s.error) return setError(errorMessage(s.error));
      setData({
        stats: s.data as AdminStats,
        payments: (p.data ?? []) as PaymentRow[],
        expiring: (e.data ?? []) as BizRow[],
        latest: (l.data ?? []) as BizRow[],
      });
    });
  }, []);

  if (error) return <p className="mx-auto max-w-6xl rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { stats, payments, expiring, latest } = data;
  const n = (x: number) => new Intl.NumberFormat("tr-TR").format(x);
  const daily = (key: "users" | "businesses" | "appointments" | "revenue") => stats.daily.map((d) => ({ day: d.day, value: Number(d[key]) }));
  const top = (o: Record<string, number>, label: (k: string) => string = (k) => k) =>
    Object.entries(o)
      .map(([k, v]) => ({ name: label(k), value: Number(v) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

  const alerts = [
    stats.expiring_7d > 0 && { text: `${stats.expiring_7d} işletmenin aboneliği 7 gün içinde bitiyor`, href: "/admin/isletmeler?durum=expiring" },
    stats.suspended > 0 && { text: `${stats.suspended} işletme askıda`, href: "/admin/isletmeler?durum=suspended" },
    stats.notifications.failed > 0 && { text: `${stats.notifications.failed} e-posta gönderilemedi (Supabase > notifications)`, href: null },
    stats.payments_failed_30d > 0 && { text: `Son 30 günde ${stats.payments_failed_30d} başarısız ödeme`, href: "/admin/odemeler?durum=failed" },
  ].filter(Boolean) as { text: string; href: string | null }[];

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Genel Bakış" hint="Tüm platformun özeti · rakamlar anlık" />

      {alerts.length > 0 && (
        <ul className="mt-6 space-y-2">
          {alerts.map((a) => (
            <li key={a.text}>
              {a.href ? (
                <Link href={a.href} className="flex items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/20 hover:bg-amber-400/15">
                  <AlertTriangle className="size-4 shrink-0" /> <span className="flex-1">{a.text}</span> <ArrowRight className="size-4" />
                </Link>
              ) : (
                <p className="flex items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/20">
                  <AlertTriangle className="size-4 shrink-0" /> {a.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Aylık tekrarlayan gelir" value={formatPrice(stats.mrr)} hint={`${n(stats.active)} aktif abonelik`} />
        <Tile label="Tahsilat (30 gün)" value={formatPrice(stats.revenue_30d)} hint={`Toplam ${formatPrice(stats.revenue_total)}`} />
        <Tile label="İşletme" value={n(stats.businesses)} hint={`${n(stats.live)} yayında · +${n(stats.businesses_30d)} bu ay`} />
        <Tile label="Kullanıcı" value={n(stats.users)} hint={`+${n(stats.users_30d)} son 30 gün`} />
        <Tile label="Randevu" value={n(stats.appointments)} hint={`+${n(stats.appointments_30d)} son 30 gün`} />
        <Tile label="Yaklaşan randevu" value={n(stats.upcoming)} hint="Bekleyen + onaylı" />
        <Tile label="İşletme cirosu (30 gün)" value={formatPrice(stats.gmv_30d)} hint="Tamamlanan randevular" />
        <Tile label="Değerlendirme" value={n(stats.reviews)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Günlük tahsilat">
          <DailyBars days={daily("revenue")} format={formatPrice} />
        </Section>
        <Section title="Yeni randevular">
          <DailyBars days={daily("appointments")} format={n} unit="randevu" />
        </Section>
        <Section title="Yeni kullanıcılar">
          <DailyBars days={daily("users")} format={n} unit="kayıt" />
        </Section>
        <Section title="Yeni işletmeler">
          <DailyBars days={daily("businesses")} format={n} unit="işletme" />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Section title="Aktif paketler" action={<Link href="/admin/paketler" className="text-xs text-brand-300">Düzenle</Link>}>
          <Breakdown items={stats.by_plan.map((p) => ({ name: p.name, value: Number(p.count), hint: formatPrice(Number(p.price) * Number(p.count)) }))} />
        </Section>
        <Section title="Abonelik durumu">
          <Breakdown
            items={[
              { name: "Aktif", value: stats.active },
              { name: "7 gün içinde bitiyor", value: stats.expiring_7d },
              { name: "Süresi dolmuş", value: stats.expired },
              { name: "Hiç paket almamış", value: stats.never_paid },
              { name: "Askıda", value: stats.suspended },
            ]}
          />
        </Section>
        <Section title="Randevu durumları">
          <Breakdown
            items={Object.entries(stats.by_status).map(([k, v]) => ({ name: STATUS[k as AppointmentStatus]?.label ?? k, value: Number(v) }))}
          />
        </Section>
        <Section title="Kategoriler">
          <Breakdown items={top(stats.by_category, categoryLabel)} />
        </Section>
        <Section title="Şehirler">
          <Breakdown items={top(stats.by_city)} />
        </Section>
        <Section title="E-posta kuyruğu">
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Bekleyen", stats.notifications.pending, ""],
              ["Hatalı", stats.notifications.failed, stats.notifications.failed ? "text-rose-300" : ""],
              ["Gönderilen (24 sa)", stats.notifications.sent_24h, ""],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="rounded-xl bg-surface-2 p-3">
                <p className={`text-xl font-semibold tabular-nums ${cls}`}>{n(value as number)}</p>
                <p className="text-[11px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-3">
            <Mail className="size-3.5" /> Kuyruk dakikada bir boşaltılır (pg_cron).
          </p>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Süresi yaklaşanlar" action={<Link href="/admin/isletmeler?durum=expiring" className="text-xs text-brand-300">Tümü</Link>}>
          {expiring.length === 0 ? (
            <Empty>7 gün içinde biten abonelik yok.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {expiring.map((b) => (
                <BizItem key={b.id} b={b} right={shortDate(b.subscription_ends_at)} />
              ))}
            </ul>
          )}
        </Section>
        <Section title="Son ödemeler" action={<Link href="/admin/odemeler" className="text-xs text-brand-300">Tümü</Link>}>
          {payments.length === 0 ? (
            <Empty>Henüz ödeme yok.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/isletmeler/${p.business_id}`} className="block truncate hover:text-brand-300">
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
        <Section title="Yeni işletmeler" action={<Link href="/admin/isletmeler" className="text-xs text-brand-300">Tümü</Link>}>
          {latest.length === 0 ? (
            <Empty>Henüz işletme yok.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {latest.map((b) => (
                <BizItem key={b.id} b={b} right={shortDate(b.created_at)} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function BizItem({ b, right }: { b: BizRow; right: string }) {
  return (
    <li>
      <Link href={`/admin/isletmeler/${b.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-brand-300">
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
