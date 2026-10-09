"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  CircleSlash,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  PlayCircle,
  Star,
} from "lucide-react";
import {
  businessState,
  dateTime,
  Empty,
  isAdminPayment,
  PAYMENT_STATUS,
  Section,
  shortDate,
  Skeleton,
  Tile,
  TONE,
} from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { categoryLabel, STATUS } from "@/lib/constants";
import { errorMessage, formatDuration, formatPrice, intlPhone } from "@/lib/format";
import type { AdminUser } from "@/lib/admin-types";
import type { Appointment, Business, Payment, Plan, Review, Service, Staff } from "@/lib/types";

type Data = {
  business: Business & { created_at: string };
  owner: AdminUser | null;
  plans: Plan[];
  staff: Staff[];
  services: Service[];
  appointments: Appointment[];
  payments: Payment[];
  reviews: Review[];
  now: number;
};

const DAY_PRESETS = [30, 90, 180, 365];

export default function AdminBusinessDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [b, u, p, st, sv, a, pay, r] = await Promise.all([
      supabase.from("businesses").select("*").eq("id", id).maybeSingle(),
      supabase.rpc("admin_users"),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("staff").select("*").eq("business_id", id).order("sort_order").order("created_at"),
      supabase.from("services").select("*").eq("business_id", id).order("sort_order").order("created_at"),
      supabase.from("appointments").select("*").eq("business_id", id).order("starts_at", { ascending: false }).limit(2000),
      supabase.from("payments").select("*").eq("business_id", id).order("created_at", { ascending: false }),
      supabase.from("reviews").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(50),
    ]);
    if (b.error) return setError(errorMessage(b.error));
    if (!b.data) return setData(null);
    setData({
      business: b.data as Data["business"],
      owner: ((u.data ?? []) as AdminUser[]).find((x) => x.id === b.data.owner_id) ?? null,
      plans: (p.data ?? []) as Plan[],
      staff: (st.data ?? []) as Staff[],
      services: (sv.data ?? []) as Service[],
      appointments: (a.data ?? []) as Appointment[],
      payments: (pay.data ?? []) as Payment[],
      reviews: (r.data ?? []) as Review[],
      now: Date.now(),
    });
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- işletmeyi ilk açılışta yükle
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const by = (s: string) => data.appointments.filter((a) => a.status === s).length;
    const completed = by("completed");
    const noShow = by("no_show");
    const phones = new Set(data.appointments.map((a) => a.customer_phone.replace(/\D/g, "").slice(-10)));
    const nowIso = new Date(data.now).toISOString();
    return {
      total: data.appointments.length,
      upcoming: data.appointments.filter((a) => ["pending", "confirmed"].includes(a.status) && a.starts_at > nowIso).length,
      completed,
      cancelled: by("cancelled"),
      noShowRate: completed + noShow ? Math.round((noShow / (completed + noShow)) * 100) : 0,
      revenue: data.appointments.filter((a) => a.status === "completed").reduce((s, a) => s + Number(a.price), 0),
      customers: phones.size,
      paid: data.payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0),
    };
  }, [data]);

  if (error) return <p className="mx-auto max-w-6xl rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;
  if (data === undefined || !stats) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-32" /><Skeleton className="h-96" /></div>;
  if (data === null) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink />
        <div className="card mt-4"><Empty>İşletme bulunamadı.</Empty></div>
      </div>
    );
  }

  const { business: b, owner, plans } = data;
  const state = businessState(b, data.now);
  const planName = (pid: string | null) => plans.find((p) => p.id === pid)?.name ?? "—";
  const activeStaff = data.staff.filter((s) => s.is_active).length;
  const staffLimit = plans.find((p) => p.id === b.plan_id)?.staff_limit;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink />

      <div className="bezel mt-4">
        <div className="bezel-core flex flex-wrap items-center gap-4 p-5 md:p-6">
          {b.logo_url ? (
            <img src={b.logo_url} alt="" className="size-16 rounded-2xl object-cover ring-1 ring-line" />
          ) : (
            <span className="grid size-16 place-items-center rounded-2xl bg-brand-400/10 text-2xl font-semibold text-brand-300">
              {b.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
              <span className={`chip ${state.className}`}>{state.label}</span>
            </div>
            <p className="mt-1 text-sm text-ink-3">
              {categoryLabel(b.category)} · {[b.district, b.city].filter(Boolean).join(", ") || "Konum yok"} · Kayıt {shortDate(b.created_at)}
            </p>
          </div>
          <Link href={`/${b.slug}`} target="_blank" className="btn btn-secondary">
            <ExternalLink className="size-4" /> /{b.slug}
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Randevu" value={String(stats.total)} hint={`${stats.upcoming} yaklaşan · ${stats.cancelled} iptal`} />
        <Tile label="İşletme cirosu" value={formatPrice(stats.revenue)} hint={`${stats.completed} tamamlanan`} />
        <Tile label="Müşteri" value={String(stats.customers)} hint={`Gelmeme oranı %${stats.noShowRate}`} />
        <Tile label="Bize ödenen" value={formatPrice(stats.paid)} hint={`${data.payments.filter((p) => p.status === "paid").length} ödeme`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Section title="Abonelik">
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Info label="Paket">{planName(b.plan_id)}</Info>
              <Info label="Bitiş">{dateTime(b.subscription_ends_at)}</Info>
              <Info label="Aktif personel">
                {activeStaff} / {staffLimit ?? "∞"}
              </Info>
              <Info label="Sahibin ayarı">{b.is_published ? "Yayında" : "Gizli"}</Info>
            </dl>
          </Section>

          <Section title="Bilgiler">
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Sahip">
                {owner?.full_name || "—"}
                {owner && <p className="text-xs text-ink-3">Son giriş: {dateTime(owner.last_sign_in_at)}</p>}
              </Info>
              <Info label="İletişim">
                <div className="flex flex-wrap gap-1.5">
                  {owner?.email && (
                    <a href={`mailto:${owner.email}`} className="chip gap-1 bg-white/5 ring-1 ring-line hover:text-brand-300">
                      <Mail className="size-3" /> {owner.email}
                    </a>
                  )}
                  {b.phone && (
                    <>
                      <a href={`tel:${b.phone}`} className="chip gap-1 bg-white/5 ring-1 ring-line hover:text-brand-300">
                        <Phone className="size-3" /> {b.phone}
                      </a>
                      <a href={`https://wa.me/${intlPhone(b.phone)}`} target="_blank" rel="noreferrer" className="chip gap-1 bg-white/5 ring-1 ring-line hover:text-brand-300">
                        <MessageCircle className="size-3" /> WhatsApp
                      </a>
                    </>
                  )}
                </div>
              </Info>
              <Info label="Adres">{[b.address, b.district, b.city].filter(Boolean).join(", ") || "—"}</Info>
              <Info label="Randevu kuralları">
                {b.slot_minutes} dk aralık · {b.booking_days} gün ileri · en erken {formatDuration(b.min_notice_minutes)} önce ·{" "}
                {b.auto_confirm ? "otomatik onay" : "elle onay"}
              </Info>
              {b.description && (
                <div className="sm:col-span-2">
                  <Info label="Açıklama">
                    <p className="whitespace-pre-line text-ink-2">{b.description}</p>
                  </Info>
                </div>
              )}
            </dl>
          </Section>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title={`Personel (${data.staff.length})`}>
              {data.staff.length === 0 ? (
                <Empty>Personel yok.</Empty>
              ) : (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {data.staff.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="truncate">
                        {s.name}
                        {s.title && <span className="text-ink-3"> · {s.title}</span>}
                      </span>
                      {!s.is_active && <span className={`chip ${TONE.muted}`}>Pasif</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Hizmetler (${data.services.length})`}>
              {data.services.length === 0 ? (
                <Empty>Hizmet yok.</Empty>
              ) : (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {data.services.map((s) => (
                    <li key={s.id} className={`flex items-center justify-between gap-2 py-2 ${s.is_active ? "" : "text-ink-4"}`}>
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 tabular-nums text-ink-3">
                        {formatDuration(s.duration_minutes)} · {formatPrice(s.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Son randevular">
            {data.appointments.length === 0 ? (
              <Empty>Henüz randevu yok.</Empty>
            ) : (
              <div className="-mx-5 mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-ink-3">
                    <tr>
                      <th className="px-5 py-2 font-medium">Tarih</th>
                      <th className="px-5 py-2 font-medium">Müşteri</th>
                      <th className="px-5 py-2 font-medium">Hizmet</th>
                      <th className="px-5 py-2 text-right font-medium">Tutar</th>
                      <th className="px-5 py-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.appointments.slice(0, 50).map((a) => (
                      <tr key={a.id}>
                        <td className="px-5 py-2 text-ink-2">{dateTime(a.starts_at)}</td>
                        <td className="px-5 py-2">
                          {a.customer_name}
                          <p className="text-xs text-ink-3">{a.customer_phone}</p>
                        </td>
                        <td className="px-5 py-2">{a.service_name}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{formatPrice(a.price)}</td>
                        <td className="px-5 py-2">
                          <span className={`chip ${STATUS[a.status].className}`}>{STATUS[a.status].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`Değerlendirmeler (${b.rating_count})`}>
            {data.reviews.length === 0 ? (
              <Empty>Henüz değerlendirme yok.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {data.reviews.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.customer_name}</span>
                      <span className="flex items-center gap-1 text-xs text-ink-3">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" /> {r.rating} · {shortDate(r.created_at)}
                      </span>
                    </div>
                    {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Actions data={data} onDone={load} />

          <Section title="Ödeme geçmişi">
            {data.payments.length === 0 ? (
              <Empty>Ödeme yok.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p>
                        {planName(p.plan_id)} · <span className="tabular-nums">{formatPrice(p.amount)}</span>
                      </p>
                      <p className="truncate text-xs text-ink-3">
                        {dateTime(p.paid_at ?? p.created_at)} · {isAdminPayment(p.merchant_oid) ? "Yönetici" : "PayTR"}
                      </p>
                    </div>
                    <span className={`chip shrink-0 ${PAYMENT_STATUS[p.status].className}`}>{PAYMENT_STATUS[p.status].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Actions({ data, onDone }: { data: Data; onDone: () => Promise<void> }) {
  const { business: b, plans } = data;
  const [planId, setPlanId] = useState(b.plan_id ?? plans[0]?.id ?? "");
  const [days, setDays] = useState(30);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const base = Math.max(b.subscription_ends_at ? new Date(b.subscription_ends_at).getTime() : 0, data.now);
  const newEnd = new Date(base + days * 864e5).toISOString();
  const subscribed = !!b.subscription_ends_at && new Date(b.subscription_ends_at).getTime() > data.now;
  const smaller = plans.find((p) => p.id === planId)?.staff_limit;

  async function run(key: string, fn: () => PromiseLike<{ error: { message?: string } | null }>, success: string) {
    setBusy(key);
    setMessage(null);
    const { error } = await fn();
    setBusy(null);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setMessage({ ok: true, text: success });
    await onDone();
  }

  const supabase = createClient();
  const grant = () =>
    run(
      "grant",
      () => supabase.rpc("admin_grant_subscription", { p_business_id: b.id, p_plan_id: planId, p_days: days, p_amount: Number(amount) || 0 }),
      `${plans.find((p) => p.id === planId)?.name} paketi ${days} gün tanımlandı.`,
    );
  const end = () =>
    confirm(`${b.name} aboneliği şimdi bitirilsin mi? Sayfa yayından düşer ve randevu almaz.`) &&
    run("end", () => supabase.rpc("admin_end_subscription", { p_business_id: b.id }), "Abonelik bitirildi.");
  const suspend = () =>
    confirm(
      b.is_suspended
        ? `${b.name} askıdan çıkarılsın mı?`
        : `${b.name} askıya alınsın mı? Sayfası gizlenir ve randevu alamaz; sahibi bunu kendisi kaldıramaz.`,
    ) &&
    run(
      "suspend",
      () => supabase.rpc("admin_set_suspended", { p_business_id: b.id, p_suspended: !b.is_suspended }),
      b.is_suspended ? "Askıdan çıkarıldı." : "İşletme askıya alındı.",
    );

  return (
    <Section title="Yönetici işlemleri" className="ring-1 ring-gold/20">
      {message && (
        <p className={`mt-3 rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-500/10 text-rose-300"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CalendarPlus className="size-4 text-brand-300" /> {subscribed ? "Süre uzat / paket değiştir" : "Paket tanımla"}
        </p>
        <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Paket">
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatPrice(p.price)}/ay · {p.staff_limit ? `${p.staff_limit} personel` : "sınırsız personel"}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-4 gap-1.5">
          {DAY_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-xl py-2 text-xs font-medium ring-1 transition ${days === d ? "bg-brand-400/15 text-brand-200 ring-brand-400/40" : "text-ink-2 ring-line hover:bg-white/5"}`}
            >
              {d === 365 ? "1 yıl" : `${d} gün`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label text-xs">Gün</span>
            <input className="input" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} />
          </label>
          <label>
            <span className="label text-xs">Alınan tutar (₺)</span>
            <input className="input" type="number" min={0} placeholder="0 = ücretsiz" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-ink-3">
          Yeni bitiş: <b className="text-ink-2">{dateTime(newEnd)}</b>. Elden/havale ödeme aldıysanız tutarı yazın; ödeme geçmişine
          “Yönetici” olarak işlenir.
          {smaller && activeStaffOver(data, smaller) && ` Bu paket ${smaller} personele izin veriyor; fazlası pasif olur.`}
        </p>
        <button type="button" disabled={!!busy || !planId} onClick={grant} className="btn btn-primary w-full">
          {busy === "grant" && <Loader2 className="size-4 animate-spin" />} {subscribed ? "Süreyi uzat" : "Paketi tanımla"}
        </button>
      </div>

      <div className="mt-5 space-y-2 border-t border-line pt-4">
        {subscribed && (
          <button type="button" disabled={!!busy} onClick={end} className="btn btn-secondary w-full justify-start">
            {busy === "end" ? <Loader2 className="size-4 animate-spin" /> : <CircleSlash className="size-4 text-amber-300" />} Aboneliği şimdi bitir
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={suspend} className={`btn w-full justify-start ${b.is_suspended ? "btn-secondary" : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20 hover:bg-rose-500/20"}`}>
          {busy === "suspend" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : b.is_suspended ? (
            <PlayCircle className="size-4 text-emerald-300" />
          ) : (
            <Ban className="size-4" />
          )}
          {b.is_suspended ? "Askıdan çıkar (yayına aç)" : "Askıya al (yayından kaldır)"}
        </button>
      </div>
    </Section>
  );
}

function activeStaffOver(data: Data, limit: number) {
  return data.staff.filter((s) => s.is_active).length > limit;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/isletmeler" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" /> İşletmeler
    </Link>
  );
}
