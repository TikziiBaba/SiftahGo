"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { CsvButton, Empty, PageTitle, Section, Skeleton, Tile } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { dayOf, errorMessage, formatDate, formatPrice, todayStr } from "@/lib/format";
import type { BillingSnapshot, Expense, Payment } from "@/lib/types";

type Row = Payment & { business_id: string | null };

const CATEGORIES: Record<Expense["category"], string> = {
  altyapi: "Altyapı ve yazılım",
  reklam: "Reklam",
  baski: "Baskı ve afiş",
  muhasebe: "Muhasebe",
  vergi: "Vergi ve resmî ödeme",
  diger: "Diğer",
};
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const shortDay = (d: string) => formatDate(d, { weekday: undefined, year: "numeric" });

export default function AdminAccounting() {
  const supabase = useMemo(() => createClient(), []);
  const thisYear = Number(todayStr().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [payments, setPayments] = useState<Row[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ spent_on: todayStr(), category: "altyapi" as Expense["category"], description: "", amount: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      supabase.from("payments").select("*").eq("status", "paid").order("paid_at", { ascending: false }).limit(5000),
      supabase.from("expenses").select("*").order("spent_on", { ascending: false }).limit(5000),
    ]);
    if (p.error || e.error) return setError(errorMessage(p.error ?? e.error));
    setPayments((p.data ?? []) as Row[]);
    setExpenses((e.data ?? []) as Expense[]);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kayıtlar ilk açılışta yüklenir
    load();
  }, [load]);

  const paidDay = (p: Row) => dayOf(p.paid_at ?? p.created_at);
  const view = useMemo(() => {
    if (!payments) return null;
    const income = payments.filter((p) => paidDay(p).startsWith(`${year}-`));
    const spent = expenses.filter((e) => e.spent_on.startsWith(`${year}-`));
    const sum = (list: { amount: number }[]) => list.reduce((s, x) => s + Number(x.amount), 0);
    return {
      income,
      spent,
      totalIncome: sum(income),
      totalSpent: sum(spent),
      months: MONTHS.map((name, i) => {
        const key = `${year}-${String(i + 1).padStart(2, "0")}`;
        const inc = sum(income.filter((p) => paidDay(p).startsWith(key)));
        const exp = sum(spent.filter((e) => e.spent_on.startsWith(key)));
        return { name, inc, exp };
      }),
      // Bedeli olan ve faturası henüz işlenmemiş ödemeler (tüm yıllar)
      pending: payments.filter((p) => Number(p.amount) > 0 && !p.invoice_number),
    };
  }, [payments, expenses, year]);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount.replace(",", "."));
    if (!(amount > 0)) return setError("Tutarı girin.");
    setBusy(true);
    setError("");
    const { error } = await supabase.from("expenses").insert({ ...form, description: form.description.trim(), amount });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setForm((f) => ({ ...f, description: "", amount: "" }));
    load();
  }

  async function removeExpense(id: string) {
    setError("");
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    load();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Muhasebe" hint="Gelir, gider ve kesilecek faturalar">
        <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Yıl">
          {Array.from({ length: 5 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <CsvButton
          filename={`gelirler-${year}`}
          rows={(view?.income ?? []).map((p) => ({
            Tarih: paidDay(p),
            İşletme: p.business_name,
            "Fatura adı": p.billing_snapshot?.legal_name ?? "",
            "Vergi / T.C. no": p.billing_snapshot?.tax_id ?? "",
            "Vergi dairesi": p.billing_snapshot?.tax_office ?? "",
            Adres: p.billing_snapshot?.address ?? "",
            Tutar: Number(p.amount),
            "Ödeme no": p.merchant_oid,
            "Fatura no": p.invoice_number ?? "",
            "Fatura tarihi": p.invoice_date ?? "",
          }))}
        />
      </PageTitle>
      <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-warn">
        Bu ekran kayıt tutar, resmî fatura üretmez ve vergi hesaplamaz. Faturayı GİB e-Arşiv ya da entegratörünüzden kesip numarasını buraya yazın;
        vergi ve beyanname için kayıtları mali müşavirinize verin.
      </p>
      {error && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>}

      {!view ? (
        <Skeleton className="mt-6 h-96" />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Gelir" value={formatPrice(view.totalIncome)} hint={`${view.income.length} ödeme`} />
            <Tile label="Gider" value={formatPrice(view.totalSpent)} hint={`${view.spent.length} kayıt`} />
            <Tile label="Fark" value={formatPrice(view.totalIncome - view.totalSpent)} hint="Vergi öncesi" />
            <Tile label="Kesilecek fatura" value={String(view.pending.length)} tone={view.pending.length ? "warn" : undefined} />
          </div>

          <Section title="Kesilecek faturalar" className="mt-6">
            {view.pending.length === 0 ? (
              <Empty>Bekleyen fatura yok.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {view.pending.map((p) => (
                  <InvoiceRow key={p.id} payment={p} onSaved={load} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Aylık özet" className="mt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-line text-xs text-ink-3">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ay</th>
                    <th className="px-4 py-3 text-right font-medium">Gelir</th>
                    <th className="px-4 py-3 text-right font-medium">Gider</th>
                    <th className="px-4 py-3 text-right font-medium">Fark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {view.months.map((m) => (
                    <tr key={m.name}>
                      <td className="px-4 py-2.5">{m.name}</td>
                      <td className="px-4 py-2.5 text-right">{formatPrice(m.inc)}</td>
                      <td className="px-4 py-2.5 text-right">{formatPrice(m.exp)}</td>
                      <td className="px-4 py-2.5 text-right">{formatPrice(m.inc - m.exp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Giderler"
            className="mt-6"
            action={
              <CsvButton
                filename={`giderler-${year}`}
                rows={view.spent.map((e) => ({ Tarih: e.spent_on, Tür: CATEGORIES[e.category], Açıklama: e.description, Tutar: Number(e.amount) }))}
              />
            }
          >
            <form onSubmit={addExpense} className="grid gap-3 border-b border-line p-4 sm:grid-cols-[9rem_11rem_1fr_7rem_auto]">
              <input type="date" required aria-label="Tarih" className="input" value={form.spent_on} onChange={(e) => setForm((f) => ({ ...f, spent_on: e.target.value }))} />
              <select aria-label="Tür" className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Expense["category"] }))}>
                {Object.entries(CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <input required maxLength={200} placeholder="Açıklama" aria-label="Açıklama" className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              <input required inputMode="decimal" placeholder="Tutar" aria-label="Tutar" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              <button disabled={busy} className="btn btn-primary">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Ekle
              </button>
            </form>
            {view.spent.length === 0 ? (
              <Empty>{year} için gider yok.</Empty>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {view.spent.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="w-28 text-ink-3">{shortDay(e.spent_on)}</span>
                    <span className="min-w-0 flex-1">
                      {e.description} <span className="text-ink-3">· {CATEGORIES[e.category]}</span>
                    </span>
                    <span className="tabular-nums">{formatPrice(e.amount)}</span>
                    <button type="button" aria-label="Gideri sil" className="btn btn-ghost" onClick={() => removeExpense(e.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function billingLine(b: BillingSnapshot | null) {
  if (!b) return "Fatura bilgisi girilmemiş";
  return [b.legal_name, b.kind === "company" ? `VKN ${b.tax_id}` : `T.C. ${b.tax_id}`, b.tax_office, b.address].filter(Boolean).join(" · ");
}

function InvoiceRow({ payment: p, onSaved }: { payment: Row; onSaved: () => void }) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().rpc("admin_set_invoice", { p_id: p.id, p_number: number, p_date: date });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <li className="grid gap-2 p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="font-medium">{p.business_name || "Silinmiş işletme"}</span>
        <span className="tabular-nums">{shortDay(dayOf(p.paid_at ?? p.created_at))} · {formatPrice(p.amount)}</span>
      </div>
      <p className={p.billing_snapshot ? "text-ink-3" : "text-warn"}>{billingLine(p.billing_snapshot)}</p>
      <form onSubmit={save} className="flex flex-wrap gap-2">
        <input required maxLength={40} placeholder="Fatura no" aria-label="Fatura no" className="input w-48" value={number} onChange={(e) => setNumber(e.target.value)} />
        <input required type="date" aria-label="Fatura tarihi" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <button disabled={busy} className="btn btn-secondary">{busy && <Loader2 className="size-4 animate-spin" />} Kaydet</button>
      </form>
      {error && <p className="text-bad">{error}</p>}
    </li>
  );
}
