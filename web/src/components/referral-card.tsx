"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2, Share2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatDate } from "@/lib/format";

type Referral = { name: string; created_at: string; rewarded_at: string | null };

/**
 * "Esnaf esnafı getirsin": işletmenin davet kodu ve bağlantısı, davet ettikleri, davet kodu girme.
 * Davetle gelen işletmenin ilk ödemesinde ikisine de 1 ay eklenir (veritabanında activate_subscription).
 */
export function ReferralCard({ hasPaid }: { hasPaid: boolean }) {
  const { business, refresh } = useBusiness();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Kayıt sayfası davet kodunu hatırlar ve kurulumda doldurur.
  const link = () => `${location.origin}/kayit?davet=${business.referral_code}`;

  useEffect(() => {
    createClient()
      .rpc("my_referrals")
      .then(({ data }) => setReferrals((data ?? []) as Referral[]));
  }, [business.id]);

  async function copy(kind: "code" | "link") {
    await navigator.clipboard.writeText(kind === "code" ? business.referral_code : link());
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function share() {
    const text = `SiftahGo'da online randevu sayfanı aç; davet kodum ${business.referral_code} ile ilk ödemende ikimize de 1 ay hediye:`;
    if (navigator.share) await navigator.share({ title: "SiftahGo daveti", text, url: link() }).catch(() => {});
    else copy("link");
  }

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } = await createClient().rpc("apply_referral", { p_code: code });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setMessage({ ok: true, text: `${data} sizi davet etti. İlk ödemenizde ikinize de 1 ay hediye eklenecek.` });
    refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 font-semibold">
        <Gift className="size-5 text-brand-300" /> Esnaf arkadaşını getir, ikinize de 1 ay
      </h2>
      <p className="mt-1 text-sm text-ink-3">
        Kodunuzla katılan işletme ilk ödemesini yaptığında hem size hem ona 1 ay hediye eklenir.
      </p>
      <div className="card mt-3 space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-3">Davet kodunuz</span>
          <code className="rounded-lg bg-surface-2 px-3 py-1.5 text-lg font-semibold tracking-widest">{business.referral_code}</code>
          <button type="button" className="btn btn-ghost" onClick={() => copy("code")}>
            {copied === "code" ? <Check className="size-4 text-brand-300" /> : <Copy className="size-4" />} Kodu kopyala
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => copy("link")}>
            {copied === "link" ? <Check className="size-4 text-brand-300" /> : <Copy className="size-4" />} Bağlantıyı kopyala
          </button>
          <button type="button" className="btn btn-secondary" onClick={share}>
            <Share2 className="size-4" /> Paylaş
          </button>
        </div>
        {referrals.length > 0 && (
          <ul className="divide-y divide-line rounded-xl bg-surface-2 text-sm">
            {referrals.map((r) => (
              <li key={`${r.name}-${r.created_at}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="font-medium">{r.name}</span>
                <span className={r.rewarded_at ? "text-emerald-300" : "text-ink-3"}>
                  {r.rewarded_at
                    ? `1 ay kazandınız · ${formatDate(r.rewarded_at, { weekday: undefined })}`
                    : `Katıldı · ilk ödemesi bekleniyor`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {business.referred_by ? (
        <p className="mt-3 text-sm text-ink-3">
          Davet koduyla katıldınız.{" "}
          {business.referral_rewarded_at ? "1 ay hediyeniz eklendi." : "İlk ödemenizde 1 ay hediye eklenecek."}
        </p>
      ) : (
        !hasPaid && (
          <form onSubmit={apply} className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="referral">Davet kodunuz var mı?</label>
              <input
                id="referral"
                className="input w-44 uppercase tracking-widest"
                maxLength={8}
                placeholder="Örn. 3FA9C21B"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button disabled={busy || code.trim().length < 8} className="btn btn-secondary">
              {busy && <Loader2 className="size-4 animate-spin" />} Kodu uygula
            </button>
          </form>
        )
      )}
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>{message.text}</p>}
    </section>
  );
}
