"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Bug, CheckCircle2, CircleAlert, Database, Mail, Server, Smartphone, XCircle } from "lucide-react";
import { Empty, PageTitle, Section, Skeleton, dateTime } from "@/components/admin/ui";
import { MigrationBanner, useDashboard } from "@/components/admin/period";
import { BarList, Donut, STATUS_COLORS } from "@/components/charts";
import { createClient } from "@/lib/supabase/client";
import { addDays, todayStr } from "@/lib/format";
import type { AdminHealth } from "@/lib/admin-types";

type ErrorRow = { id: string; source: string; message: string; count: number; last_seen: string; url: string };

const KIND: Record<string, string> = {
  booked: "Randevu alındı",
  confirmed: "Onaylandı",
  cancelled: "İptal",
  rescheduled: "Ertelendi",
  reminder: "Hatırlatma (1 gün)",
  reminder_soon: "Hatırlatma (2 saat)",
  review: "Değerlendirme isteği",
};
const n = (x: number) => new Intl.NumberFormat("tr-TR").format(x);

/** Sunucu ayarları, e-posta/bildirim kuyrukları ve hatalar tek bakışta. */
export default function SystemPage() {
  const today = todayStr();
  const dash = useDashboard(addDays(today, -6), today);
  const [health, setHealth] = useState<AdminHealth | null | "error">(null);
  const [errors, setErrors] = useState<ErrorRow[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setHealth("error"));
    createClient()
      .from("error_logs")
      .select("id, source, message, count, last_seen, url")
      .is("resolved_at", null)
      .order("last_seen", { ascending: false })
      .limit(6)
      .then(({ data }) => setErrors((data ?? []) as ErrorRow[]));
  }, []);

  const ops = dash?.data?.ops;
  const checks: { label: string; ok: boolean | null; hint: string; warn?: boolean }[] =
    health && health !== "error"
      ? [
          { label: "PayTR anahtarları", ok: health.paytr, hint: health.paytr ? "Online ödeme açık" : "PAYTR_MERCHANT_* eksik" },
          { label: "PayTR canlı modu", ok: !health.paytrTestMode, hint: health.paytrTestMode ? "Test modunda: gerçek tahsilat yok" : "Gerçek kartlar" },
          { label: "E-posta (Resend)", ok: health.email, hint: health.email ? "RESEND_API_KEY ve EMAIL_FROM tanımlı" : "E-postalar gönderilemez" },
          { label: "Görsel depolama (R2)", ok: health.r2, hint: health.r2 ? "Logo ve galeri yüklenebilir" : "CLOUDFLARE_R2_* eksik" },
          { label: "Sunucu anahtarı", ok: health.serviceRole, hint: health.serviceRole ? "Ödeme bildirimi ve hesap silme çalışır" : "SUPABASE_SERVICE_ROLE_KEY eksik" },
          { label: "Zamanlanmış görev", ok: health.cron, hint: health.cron ? "CRON_SECRET tanımlı" : "Hatırlatma ve bildirim gönderimi durur" },
          { label: "Bot koruması (Turnstile)", ok: health.turnstile, hint: health.turnstile ? "Giriş ve kayıtta açık" : "Kapalı" },
          { label: "Ayrıntılı analitik (SQL)", ok: dash ? !!dash.data : null, hint: dash?.data ? "admin_dashboard kurulu" : "20261025 ek dosyası bekleniyor" },
        ]
      : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Sistem durumu" hint="Sunucu ayarları, kuyruklar ve hatalar · son 7 gün" />
      {dash?.legacy && (
        <div className="mt-6">
          <MigrationBanner />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Section title="Ayarlar" action={<Server className="size-4 text-ink-3" />}>
          {health === null ? (
            <Skeleton className="mt-3 h-64" />
          ) : health === "error" ? (
            <p className="mt-3 text-sm text-bad">Sunucu durumu alınamadı.</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-line">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 py-2.5 text-sm">
                    {c.ok === null ? <CircleAlert className="size-4 text-ink-3" /> : c.ok ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-bad" />}
                    <span className="flex-1 font-medium">{c.label}</span>
                    <span className={`text-right text-xs ${c.ok === false ? "text-bad" : "text-ink-3"}`}>{c.hint}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-3">
                Adres {health.appUrl ?? "—"} · bölge {health.region ?? "yerel"} · sürüm {health.commit ?? "yerel"}
              </p>
            </>
          )}
        </Section>

        <Section title="E-posta kuyruğu (7 gün)" action={<Mail className="size-4 text-ink-3" />}>
          {!ops ? (
            <Skeleton className="mt-3 h-64" />
          ) : (
            <>
              <Donut
                title="E-posta durumu"
                items={[
                  { label: "Gönderildi", value: ops.email.sent ?? 0, color: STATUS_COLORS.completed },
                  { label: "Bekliyor", value: ops.email.pending ?? 0, color: STATUS_COLORS.pending },
                  { label: "Hatalı", value: ops.email.failed ?? 0, color: STATUS_COLORS.no_show },
                  { label: "Atlandı", value: ops.email.skipped ?? 0, color: STATUS_COLORS.cancelled },
                ]}
              />
              <p className="mt-3 text-xs text-ink-3">
                En eski bekleyen: {ops.email_oldest_pending ? dateTime(ops.email_oldest_pending) : "yok"}
              </p>
            </>
          )}
        </Section>
      </div>

      {ops && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Section title="E-posta türleri" action={<Mail className="size-4 text-ink-3" />}>
            <BarList
              items={Object.entries(
                ops.email_by_kind.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + r.count }), {}),
              )
                .map(([k, v]) => ({ name: KIND[k] ?? k, value: v, hint: `${ops.email_by_kind.filter((r) => r.kind === k && r.status === "failed").reduce((s, r) => s + r.count, 0)} hatalı` }))
                .sort((a, b) => b.value - a.value)}
              format={n}
            />
          </Section>
          <Section title="Anlık bildirimler (7 gün)" action={<Bell className="size-4 text-ink-3" />}>
            <BarList
              items={[
                { name: "Gönderildi", value: ops.push.sent ?? 0 },
                { name: "Bekliyor", value: ops.push.pending ?? 0 },
                { name: "Hatalı", value: ops.push.failed ?? 0 },
                { name: "Atlandı (telefonu yok)", value: ops.push.skipped ?? 0 },
              ]}
              format={n}
            />
          </Section>
          <Section title="Kayıtlı cihazlar" action={<Smartphone className="size-4 text-ink-3" />}>
            <BarList items={Object.entries(ops.push_tokens).map(([k, v]) => ({ name: k === "android" ? "Android" : k === "ios" ? "iOS" : k, value: v }))} format={n} empty="Kayıtlı cihaz yok." />
          </Section>
        </div>
      )}

      <Section
        title="Çözülmemiş hatalar"
        className="mt-4"
        action={
          <Link href="/admin/hatalar" className="flex items-center gap-1 text-xs text-accent">
            <Bug className="size-3.5" /> Tümü
          </Link>
        }
      >
        {errors === null ? (
          <Skeleton className="mt-3 h-32" />
        ) : errors.length === 0 ? (
          <Empty>Çözülmemiş hata yok.</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {errors.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="chip shrink-0 bg-tint/5 text-2xs uppercase text-ink-3">{e.source}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.message}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">
                  {n(e.count)}× · {dateTime(e.last_seen)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {ops && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
            <Database className="size-3.5" /> Son 7 günde kaynağa göre:{" "}
            {Object.entries(ops.errors_by_source)
              .map(([k, v]) => `${k} ${n(v)}`)
              .join(" · ") || "hata yok"}
          </p>
        )}
      </Section>
    </div>
  );
}
