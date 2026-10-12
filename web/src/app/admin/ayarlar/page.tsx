"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PageTitle, Section, Skeleton } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { AppSettings } from "@/lib/types";

export default function AdminSettings() {
  const [form, setForm] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    createClient()
      .from("app_settings")
      .select("phone_verification, whatsapp_number")
      .maybeSingle()
      .then(({ data }) => setForm(data ?? { phone_verification: false, whatsapp_number: "" }));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("app_settings")
      .update({ phone_verification: form.phone_verification, whatsapp_number: form.whatsapp_number.replace(/\D/g, "") })
      .eq("id", true);
    setBusy(false);
    setMessage(
      error
        ? { ok: false, text: error.message.includes("check constraint") ? "Doğrulamayı açmak için WhatsApp numarası girin." : errorMessage(error) }
        : { ok: true, text: "Kaydedildi." },
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Ayarlar" hint="Sitenin tamamını etkileyen ayarlar" />
      {!form ? (
        <Skeleton className="mt-6 h-48" />
      ) : (
        <form onSubmit={save} className="mt-6">
          <Section title="WhatsApp ile telefon doğrulama">
            <p className="mt-1 text-sm text-ink-3">
              Açıkken müşteri ilk randevusundan önce numarasını bir kez doğrular: hazır kodu SiftahGo WhatsApp numarasına
              gönderir, gelen mesajın numarası hesabına bağlanır. Gelen mesaj için Meta ücret almaz. Açmadan önce Meta&apos;da
              webhook adresini (<span className="font-mono">/api/whatsapp</span>) kurun ve bir kod göndererek deneyin.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="wa">WhatsApp Business numarası</label>
                <input
                  id="wa"
                  className="input"
                  inputMode="numeric"
                  placeholder="905xxxxxxxxx (ülke koduyla)"
                  value={form.whatsapp_number}
                  onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-brand-400"
                  checked={form.phone_verification}
                  onChange={(e) => setForm({ ...form, phone_verification: e.target.checked })}
                />
                <span>
                  <b>Randevu için telefon doğrulaması zorunlu</b>
                  <span className="block text-ink-3">Kapalıyken müşteri telefonunu kendisi yazar (doğrulanmaz).</span>
                </span>
              </label>
            </div>
          </Section>
          <div className="mt-4 flex items-center gap-3">
            <button disabled={busy} className="btn btn-primary px-6">
              {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
            </button>
            {message && <p className={`text-sm ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>{message.text}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
