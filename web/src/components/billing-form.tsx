"use client";

import { useEffect, useState } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { BillingProfile } from "@/lib/types";

/** Esnafın fatura bilgileri. Ödeme onaylanınca o anki bilgi ödeme kaydına kopyalanır. */
export function BillingForm({ businessId }: { businessId: string }) {
  const supabase = createClient();
  const [form, setForm] = useState({ kind: "individual" as BillingProfile["kind"], legal_name: "", tax_id: "", tax_office: "", address: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const company = form.kind === "company";

  useEffect(() => {
    supabase
      .from("billing_profiles")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const p = data as BillingProfile;
          setForm({ kind: p.kind, legal_name: p.legal_name, tax_id: p.tax_id, tax_office: p.tax_office, address: p.address });
        }
        setLoaded(true);
      });
  }, [supabase, businessId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    const taxId = form.tax_id.trim();
    if (!(company ? /^\d{10}$/ : /^\d{11}$/).test(taxId)) {
      return setError(company ? "Vergi numarası 10 haneli olmalı." : "T.C. kimlik numarası 11 haneli olmalı.");
    }
    setBusy(true);
    const { error } = await supabase
      .from("billing_profiles")
      .upsert({ ...form, business_id: businessId, tax_id: taxId, tax_office: company ? form.tax_office.trim() : "", updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSaved(true);
  }

  if (!loaded) return <div className="card mt-3 h-48 animate-pulse" />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={submit} className="card mt-3 grid gap-4 p-5">
      <div role="radiogroup" aria-label="Fatura türü" className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["individual", "Şahıs"],
            ["company", "Şirket / vergi mükellefi"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="fatura-turu" checked={form.kind === k} onChange={() => setForm((f) => ({ ...f, kind: k }))} className="accent-brand-400" />
            {label}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="legal_name">{company ? "Ticaret unvanı" : "Ad soyad"}</label>
          <input id="legal_name" required maxLength={200} className="input" value={form.legal_name} onChange={set("legal_name")} />
        </div>
        <div>
          <label className="label" htmlFor="tax_id">{company ? "Vergi numarası" : "T.C. kimlik numarası"}</label>
          <input id="tax_id" required inputMode="numeric" maxLength={company ? 10 : 11} className="input" value={form.tax_id} onChange={set("tax_id")} />
        </div>
        {company && (
          <div>
            <label className="label" htmlFor="tax_office">Vergi dairesi</label>
            <input id="tax_office" required maxLength={100} className="input" value={form.tax_office} onChange={set("tax_office")} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">Fatura adresi</label>
          <input id="address" required maxLength={300} className="input" value={form.address} onChange={set("address")} />
        </div>
      </div>
      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>}
      {saved && <p className="text-sm text-ok">Fatura bilgileriniz kaydedildi. Sonraki ödemelerde kullanılır.</p>}
      <div>
        <button disabled={busy} className="btn btn-secondary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />} Kaydet
        </button>
      </div>
    </form>
  );
}
