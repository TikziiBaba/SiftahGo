"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Download, Landmark, Loader2, Undo2, type LucideIcon } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { addDays, dayBounds, dayOf, errorMessage, formatDate, formatPrice, formatTime, todayStr } from "@/lib/format";
import type { AppointmentStatus, PaymentMethod, StaffCommission } from "@/lib/types";

type Row = {
  id: string;
  starts_at: string;
  customer_name: string;
  service_name: string;
  price: number;
  status: AppointmentStatus;
  payment_method: PaymentMethod | null;
  paid_amount: number | null;
  staff_id: string | null;
  staff: { name: string } | null;
};

const METHODS: { id: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { id: "cash", label: "Nakit", icon: Banknote },
  { id: "card", label: "Kart", icon: CreditCard },
  { id: "transfer", label: "Havale", icon: Landmark },
];

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const nextMonth = (day: string) => {
  const [y, m] = day.slice(0, 7).split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

// Excel (Türkçe) ayırıcı olarak noktalı virgül bekler; BOM olmadan Türkçe harfler bozuk görünür.
function csvCell(v: string | number) {
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ayın ödemesi girilen randevuları ve personel primi; muhasebeciye gönderilecek dosya. */
function downloadMonth(rows: Row[], rates: StaffCommission[], month: string, slug: string) {
  const label = METHODS.reduce<Record<string, string>>((a, m) => ({ ...a, [m.id]: m.label }), {});
  const paid = rows.filter((r) => r.payment_method);
  const lines: (string | number)[][] = [
    ["Tarih", "Saat", "Müşteri", "Hizmet", "Personel", "Liste fiyatı", "Ödenen", "Ödeme şekli"],
    ...paid.map((r) => [
      dayOf(r.starts_at).split("-").reverse().join("."),
      formatTime(r.starts_at),
      r.customer_name,
      r.service_name,
      r.staff?.name ?? "",
      Number(r.price),
      Number(r.paid_amount ?? 0),
      label[r.payment_method!],
    ]),
    [],
    ["Toplam", "", "", "", "", "", paid.reduce((s, r) => s + Number(r.paid_amount ?? 0), 0), ""],
    ...METHODS.map((m) => [m.label, "", "", "", "", "", sum(rows)[m.id], ""]),
    [],
    ["Personel", "İş sayısı", "Ciro", "Prim oranı (%)", "Prim"],
    ...staffTotals(rows).map(([id, s]) => {
      const rate = Number(rates.find((r) => r.staff_id === id)?.percent ?? 0);
      return [s.name, s.count, s.revenue, rate, Math.round(s.revenue * rate) / 100];
    }),
  ];
  const csv = "\uFEFF" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `kasa-${month.slice(0, 7)}-${slug}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function staffTotals(rows: Row[]) {
  const staff = new Map<string, { name: string; revenue: number; count: number }>();
  for (const r of rows) {
    if (!r.staff_id || !r.payment_method) continue;
    const s = staff.get(r.staff_id) ?? { name: r.staff?.name ?? "Personel", revenue: 0, count: 0 };
    s.revenue += Number(r.paid_amount ?? 0);
    s.count++;
    staff.set(r.staff_id, s);
  }
  return [...staff.entries()];
}

function sum(rows: Row[]) {
  const by: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 };
  for (const r of rows) if (r.payment_method) by[r.payment_method] += Number(r.paid_amount ?? 0);
  return { ...by, total: by.cash + by.card + by.transfer };
}

/** Kasa: günün randevularına ödeme işlenir; gün sonu, ay toplamı ve personel primi. */
export default function CashPage() {
  const { business } = useBusiness();
  const supabase = useMemo(() => createClient(), []);
  // Mobil uygulamadaki "Excel dökümü" düğmesi ?ay=YYYY-MM ile o ayı açar.
  const [day, setDay] = useState(() => {
    const ay = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("ay");
    return ay && /^\d{4}-(0[1-9]|1[0-2])$/.test(ay) ? `${ay}-01` : todayStr();
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rates, setRates] = useState<StaffCommission[]>([]);
  const [error, setError] = useState("");
  const month = monthStart(day);

  const load = useCallback(async () => {
    const [{ data, error }, { data: c }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, customer_name, service_name, price, status, payment_method, paid_amount, staff_id, staff(name)")
        .eq("business_id", business.id)
        .gte("starts_at", dayBounds(month).from)
        .lt("starts_at", dayBounds(nextMonth(month)).from)
        .neq("status", "cancelled")
        .order("starts_at"),
      supabase.from("staff_commissions").select("*").eq("business_id", business.id),
    ]);
    if (error) return setError(errorMessage(error));
    setRows((data ?? []) as unknown as Row[]);
    setRates((c ?? []) as StaffCommission[]);
  }, [supabase, business.id, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ay değişince kayıtlar yeniden okunur
    load();
  }, [load]);

  const today = rows?.filter((r) => dayOf(r.starts_at) === day && r.status !== "no_show") ?? [];
  const daySum = sum(today);
  const monthSum = sum(rows ?? []);
  const unpaid = today.filter((r) => !r.payment_method && new Date(r.starts_at) <= new Date());

  async function pay(r: Row, method: PaymentMethod | null, amount?: number) {
    setError("");
    const past = new Date(r.starts_at) <= new Date();
    const { error } = await supabase
      .from("appointments")
      .update({
        payment_method: method,
        paid_amount: method ? (amount ?? r.price) : null,
        // Saati geçmiş randevunun ödemesi alındıysa gelmiş demektir.
        ...(method && past && (r.status === "confirmed" || r.status === "pending") && { status: "completed" }),
      })
      .eq("id", r.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Kasa</h1>
      <p className="text-sm text-ink-3">Gelen müşterinin ödemesini işaretleyin; gün sonu ve ay toplamı kendiliğinden çıkar.</p>

      <div className="mt-6 flex items-center gap-2">
        <button className="btn btn-ghost p-2" aria-label="Önceki gün" onClick={() => setDay(addDays(day, -1))}>
          <ChevronLeft className="size-5" />
        </button>
        <input type="date" className="input w-auto" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="btn btn-ghost p-2" aria-label="Sonraki gün" onClick={() => setDay(addDays(day, 1))}>
          <ChevronRight className="size-5" />
        </button>
        {day !== todayStr() && (
          <button className="btn btn-ghost text-sm" onClick={() => setDay(todayStr())}>
            Bugün
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${formatDate(day, { weekday: undefined })} toplam`} value={formatPrice(daySum.total)} strong />
        {METHODS.map((m) => (
          <Stat key={m.id} label={m.label} value={formatPrice(daySum[m.id])} />
        ))}
      </div>
      {unpaid.length > 0 && (
        <p className="mt-3 text-sm text-warn">
          Saati geçmiş {unpaid.length} randevunun ödemesi girilmedi ({formatPrice(unpaid.reduce((s, r) => s + Number(r.price), 0))}).
        </p>
      )}

      <section className="card mt-4 divide-y divide-line">
        {rows === null ? (
          <div className="grid place-items-center p-10">
            <Loader2 className="size-5 animate-spin text-ink-3" />
          </div>
        ) : today.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">Bu gün randevu yok.</p>
        ) : (
          today.map((r) => <PayRow key={r.id} row={r} onPay={pay} />)
        )}
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{formatDate(month, { weekday: undefined, day: undefined, year: "numeric" })} toplamı</h2>
            <button
              className="btn btn-secondary py-1.5 text-sm"
              disabled={!rows?.some((r) => r.payment_method)}
              onClick={() => rows && downloadMonth(rows, rates, month, business.slug)}
            >
              <Download className="size-4" /> Excel dökümü
            </button>
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatPrice(monthSum.total)}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            {METHODS.map((m) => (
              <div key={m.id} className="flex justify-between">
                <dt className="text-ink-3">{m.label}</dt>
                <dd className="tabular-nums">{formatPrice(monthSum[m.id])}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-ink-3">Ödemesi girilen randevu</dt>
              <dd className="tabular-nums">{rows?.filter((r) => r.payment_method).length ?? 0}</dd>
            </div>
          </dl>
        </section>
        <Commissions rows={rows ?? []} rates={rates} businessId={business.id} onSaved={load} onError={setError} />
      </div>
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`card p-4 ${strong ? "ring-1 ring-brand-400/30" : ""}`}>
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${strong ? "text-2xl text-accent" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function PayRow({ row, onPay }: { row: Row; onPay: (r: Row, m: PaymentMethod | null, amount?: number) => Promise<void> }) {
  const [amount, setAmount] = useState(String(Number(row.price)));
  const [busy, setBusy] = useState(false);
  const paid = METHODS.find((m) => m.id === row.payment_method);
  const run = async (m: PaymentMethod | null) => {
    const n = Number(amount.replace(",", "."));
    if (m && (!Number.isFinite(n) || n < 0)) return;
    setBusy(true);
    await onPay(row, m, n);
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <span className="w-12 font-semibold tabular-nums">{formatTime(row.starts_at)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.customer_name}</p>
        <p className="truncate text-sm text-ink-3">
          {[row.service_name, row.staff?.name].filter(Boolean).join(" · ")}
          {row.status === "no_show" && " · Gelmedi"}
        </p>
      </div>
      {paid ? (
        <div className="flex items-center gap-2">
          <span className="chip bg-emerald-400/10 text-ok">
            <paid.icon className="size-3.5" /> {paid.label} · {formatPrice(Number(row.paid_amount))}
          </span>
          <button className="btn btn-ghost p-2 text-ink-3" aria-label="Ödemeyi geri al" disabled={busy} onClick={() => run(null)}>
            <Undo2 className="size-4" />
          </button>
        </div>
      ) : row.status === "no_show" ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Tutar"
            inputMode="decimal"
            className="input w-24 py-2 text-right tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {METHODS.map((m) => (
            <button key={m.id} className="btn btn-secondary py-2" disabled={busy} onClick={() => run(m.id)}>
              <m.icon className="size-4" /> {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Personel primi: ayın ödemesi alınan cirosu x oran. Oran yalnızca esnafa görünür.
function Commissions({
  rows,
  rates,
  businessId,
  onSaved,
  onError,
}: {
  rows: Row[];
  rates: StaffCommission[];
  businessId: string;
  onSaved: () => void;
  onError: (e: string) => void;
}) {
  const staff = new Map(staffTotals(rows));

  async function save(staffId: string, value: string) {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return onError("Prim oranı 0 ile 100 arasında olmalı.");
    const { error } = await createClient()
      .from("staff_commissions")
      .upsert({ staff_id: staffId, business_id: businessId, percent: n });
    if (error) return onError(errorMessage(error));
    onSaved();
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Personel primi (bu ay)</h2>
      <p className="mt-1 text-xs text-ink-3">Ödemesi girilen randevuların cirosu üzerinden hesaplanır. Oranlar yalnızca size görünür.</p>
      {staff.size === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Bu ay personele bağlı ödeme yok.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              <th className="py-1.5 font-medium">Personel</th>
              <th className="py-1.5 text-right font-medium">Ciro</th>
              <th className="py-1.5 text-right font-medium">Oran</th>
              <th className="py-1.5 text-right font-medium">Prim</th>
            </tr>
          </thead>
          <tbody>
            {[...staff.entries()].map(([id, s]) => {
              const rate = Number(rates.find((r) => r.staff_id === id)?.percent ?? 0);
              return (
                <tr key={id} className="border-t border-line">
                  <td className="py-2">
                    {s.name} <span className="text-xs text-ink-3">· {s.count} iş</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(s.revenue)}</td>
                  <td className="py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      %
                      <input
                        aria-label={`${s.name} prim oranı`}
                        inputMode="decimal"
                        className="input w-16 px-2 py-1 text-right"
                        defaultValue={rate}
                        key={`${id}-${rate}`}
                        onBlur={(e) => Number(e.target.value) !== rate && save(id, e.target.value)}
                      />
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatPrice((s.revenue * rate) / 100)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
