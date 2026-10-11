"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Loader2, ShieldCheck, Wallet, X } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { BASE_FEATURES, isSubscribed, isTrial, PLAN_FEATURES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/format";
import type { BalanceTransaction, Payment, Plan } from "@/lib/types";

const POPULAR = "esnaf";
const TOPUP_PRESETS = [250, 500, 1000];

export default function SubscriptionPage() {
  const { business, refresh } = useBusiness();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [moves, setMoves] = useState<BalanceTransaction[]>([]);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [topup, setTopup] = useState("500");
  const [accepted, setAccepted] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLLabelElement>(null);
  // PayTR ödeme sonrası buraya ?odeme=basarili|hata ile döner.
  const [result] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(location.search).get("odeme")));
  const [waiting, setWaiting] = useState(result === "basarili");

  const subscribed = isSubscribed(business);
  const trial = isTrial(business);
  const currentPlan = plans?.find((p) => p.id === business.plan_id);
  const lastPayment = payments[0];
  const lastStatus = lastPayment?.status;

  useEffect(() => {
    // Ödeme sayfası iframe içinde döndüyse ana pencereyi yönlendir.
    if (result && window.top && window.top !== window.self) window.top.location.href = location.href;
  }, [result]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [p, pay, bal, mv] = await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("payments").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("business_balance", { p_business_id: business.id }),
      supabase.from("balance_transactions").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setPlans((p.data ?? []) as Plan[]);
    setPayments((pay.data ?? []) as Payment[]);
    setBalance(Number(bal.data ?? 0));
    setMoves((mv.data ?? []) as BalanceTransaction[]);
  }, [business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paketleri, ödemeleri ve bakiyeyi yükle
    load();
  }, [load, business.subscription_ends_at]);

  // Ödeme onayı (PayTR bildirimi) birkaç saniye sürebilir; son ödeme sonuçlanana kadar yokla.
  useEffect(() => {
    if (!waiting) return;
    if (lastStatus && lastStatus !== "pending") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ödeme sonuçlandı, yoklamayı bitir
      setWaiting(false);
      history.replaceState(null, "", "/panel/abonelik");
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      refresh();
      load();
      if (tries >= 20) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, lastStatus, refresh, load]);

  function checkConsent() {
    if (accepted) return true;
    setConsentError(true);
    consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  async function startPayment(body: { planId: string } | { topup: number }, key: string) {
    setBusyPlan(key);
    setError("");
    setNotice("");
    const res = await fetch("/api/paytr/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusyPlan(null);
    if (!res.ok) return setError(json.error ?? "Ödeme başlatılamadı.");
    setToken(json.token);
  }

  async function buy(plan: Plan) {
    if (!checkConsent()) return;
    if (balance === null || balance < Number(plan.price)) return startPayment({ planId: plan.id }, plan.id);
    if (!confirm(`${plan.name} paketi (30 gün) bakiyenizden ${formatPrice(plan.price)} düşülerek alınsın mı?`)) return;
    setBusyPlan(plan.id);
    setError("");
    setNotice("");
    const { error } = await createClient().rpc("buy_plan_with_balance", { p_plan_id: plan.id });
    setBusyPlan(null);
    if (error) return setError(error.message);
    setNotice(`${plan.name} paketi bakiyenizden alındı.`);
    await refresh();
    load();
  }

  function loadBalance() {
    if (!checkConsent()) return;
    const amount = Number(topup);
    if (!Number.isInteger(amount) || amount < 50 || amount > 10000) {
      return setError("Yükleme tutarı 50 ile 10.000 TL arasında, tam sayı olmalı.");
    }
    startPayment({ topup: amount }, "topup");
  }

  const moveLabel = (m: BalanceTransaction) =>
    m.kind === "topup"
      ? "Bakiye yükleme"
      : m.kind === "plan"
        ? `${plans?.find((p) => p.id === m.plan_id)?.name ?? m.plan_id} paketi`
        : m.note || "Düzeltme";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Abonelik</h1>
      <p className="mt-1 text-sm text-ink-3">Paketler aylıktır. Taahhüt yok; her ödeme 30 gün geçerlidir ve kalan sürenize eklenir.</p>

      {waiting && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-400/10 p-4 text-sm text-brand-200 ring-1 ring-brand-400/20">
          <Loader2 className="size-5 animate-spin" /> Ödemeniz alındı, onay bekleniyor. Bu birkaç saniye sürebilir…
        </div>
      )}
      {result === "basarili" && !waiting && lastPayment?.status === "paid" && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
          <CheckCircle2 className="size-5" />
          {lastPayment.plan_id ? "Teşekkürler! Aboneliğiniz aktif. Sayfanız yayında ve randevu alabilirsiniz." : "Teşekkürler! Bakiyeniz yüklendi."}
        </div>
      )}
      {result === "hata" && (
        <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300 ring-1 ring-rose-400/20">
          Ödeme tamamlanamadı. Kartınızdan çekim yapılmadı; tekrar deneyebilirsiniz.
        </p>
      )}
      {notice && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
          <CheckCircle2 className="size-5" /> {notice}
        </div>
      )}
      {error && <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300 ring-1 ring-rose-400/20">{error}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="bezel">
          <div className="bezel-core flex h-full flex-col gap-3 p-5 md:p-6">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">Mevcut durum</p>
            {trial ? (
              <p className="text-lg font-semibold">
                Ücretsiz deneme (Pro) ·{" "}
                <span className="font-normal text-ink-2">{formatDate(business.subscription_ends_at!, { weekday: undefined, year: "numeric" })} tarihine kadar</span>
              </p>
            ) : subscribed ? (
              <p className="text-lg font-semibold">
                {currentPlan?.name ?? "Paket"} paketi ·{" "}
                <span className="font-normal text-ink-2">{formatDate(business.subscription_ends_at!, { weekday: undefined, year: "numeric" })} tarihine kadar</span>
              </p>
            ) : (
              <p className="text-lg font-semibold text-amber-300">Aktif paketiniz yok</p>
            )}
            {trial && (
              <p className="text-sm text-ink-3">
                Deneme bitince sayfanız yayından kalkar. Şimdi paket seçerseniz paketiniz hemen başlar, kalan deneme günleri de üstüne eklenir.
              </p>
            )}
            {!subscribed && (
              <p className="text-sm text-ink-3">
                Paket seçene kadar sayfanız yayında görünmez ve randevu alınamaz. Ayarlar’dan bilgilerinizi şimdiden doldurabilirsiniz.
              </p>
            )}
          </div>
        </div>

        <div className="bezel">
          <div className="bezel-core flex h-full flex-col gap-3 p-5 md:p-6">
            <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">
              <Wallet className="size-3.5" /> Bakiye
            </p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{balance === null ? "…" : formatPrice(balance)}</p>
            <p className="text-sm text-ink-3">
              Bakiye yükleyip paketlerinizi bakiyeden alabilirsiniz. Bakiye yalnızca paket almak için kullanılır; nakit olarak çekilemez.
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              {TOPUP_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTopup(String(v))}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${topup === String(v) ? "bg-brand-400/15 text-brand-200 ring-brand-400/40" : "text-ink-2 ring-line hover:bg-white/5"}`}
                >
                  {formatPrice(v)}
                </button>
              ))}
              <input
                type="number"
                min={50}
                max={10000}
                step={1}
                inputMode="numeric"
                aria-label="Yüklenecek tutar (TL)"
                className="input w-28 py-1.5"
                value={topup}
                onChange={(e) => setTopup(e.target.value)}
              />
              <button type="button" disabled={busyPlan !== null} onClick={loadBalance} className="btn btn-secondary py-2">
                {busyPlan === "topup" && <Loader2 className="size-4 animate-spin" />} Bakiye yükle
              </button>
            </div>
          </div>
        </div>
      </div>

      <label
        ref={consentRef}
        className={`mt-6 flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-sm text-ink-2 ring-1 transition ${consentError && !accepted ? "bg-rose-500/10 ring-rose-400/40" : "ring-line"}`}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => {
            setAccepted(e.target.checked);
            setConsentError(false);
          }}
          className="mt-0.5 size-4 shrink-0 accent-brand-400"
        />
        <span>
          <Link href="/yasal/mesafeli-satis" target="_blank" className="text-brand-300 underline-offset-2 hover:underline">
            Ön bilgilendirme formunu ve mesafeli satış sözleşmesini
          </Link>{" "}
          okudum, onaylıyorum.{" "}
          <Link href="/yasal/iptal-iade" target="_blank" className="text-brand-300 underline-offset-2 hover:underline">
            İptal ve iade koşullarına
          </Link>{" "}
          göre ödeme sonrasında nakit iade yapılmadığını ve bakiyenin geri çekilemediğini biliyorum.
          {consentError && !accepted && <span className="mt-1 block text-rose-300">Ödeme için bu kutuyu işaretleyin.</span>}
        </span>
      </label>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {plans === null &&
          Array.from({ length: 3 }, (_, i) => <div key={i} className="h-96 animate-pulse rounded-[2rem] bg-surface-2" />)}
        {plans?.map((plan) => {
          const isCurrent = subscribed && !trial && plan.id === business.plan_id;
          const popular = plan.id === POPULAR;
          const fromBalance = balance !== null && balance >= Number(plan.price);
          return (
            <div key={plan.id} className={`bezel ${popular ? "ring-brand-400/40" : ""}`}>
              <div className={`bezel-core relative flex h-full flex-col overflow-hidden p-6 ${popular ? "bg-gradient-to-b from-brand-900/40 to-surface" : ""}`}>
                {popular && <div className="absolute -right-16 -top-16 size-48 rounded-full bg-brand-400/20 blur-3xl" />}
                <div className="relative flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  {popular && <span className="eyebrow py-0.5 text-brand-200">En çok tercih edilen</span>}
                </div>
                <p className="relative mt-4">
                  <span className="text-4xl font-semibold tracking-tight">{formatPrice(plan.price)}</span>
                  <span className="text-ink-3"> / ay</span>
                </p>
                <ul className="relative mt-6 flex-1 space-y-2.5 text-sm">
                  <Feature>{plan.staff_limit ? `${plan.staff_limit} personel` : "Sınırsız personel"}</Feature>
                  {BASE_FEATURES.map((f) => (
                    <Feature key={f}>{f}</Feature>
                  ))}
                  {Object.entries(PLAN_FEATURES).map(([key, label]) => (
                    <Feature key={key} off={!plan.features.includes(key)}>
                      {label}
                    </Feature>
                  ))}
                </ul>
                <button
                  disabled={busyPlan !== null}
                  onClick={() => buy(plan)}
                  className={`btn relative mt-8 w-full py-3 ${popular ? "btn-primary" : "btn-secondary"}`}
                >
                  {busyPlan === plan.id && <Loader2 className="size-4 animate-spin" />}
                  {isCurrent ? "30 gün uzat" : subscribed && !trial ? "Bu pakete geç" : "Seç ve öde"}
                </button>
                <p className="relative mt-2 text-center text-xs text-ink-3">{fromBalance ? "Bakiyenizden ödenir" : "Kartla ödenir"}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-ink-3">
        <ShieldCheck className="size-4 text-brand-300" /> Ödemeler PayTR güvencesiyle alınır; kart bilgileriniz bize ulaşmaz.
        Küçük pakete geçerseniz fazla personel pasif olur.
      </p>

      {moves.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold">Bakiye hareketleri</h2>
          <ul className="card mt-3 divide-y divide-line">
            {moves.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink-2">{formatDate(m.created_at, { weekday: undefined, year: "numeric" })}</span>
                <span>{moveLabel(m)}</span>
                <span className={`tabular-nums ${m.amount > 0 ? "text-emerald-300" : "text-ink-2"}`}>
                  {m.amount > 0 ? "+" : "−"}
                  {formatPrice(Math.abs(m.amount))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {payments.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold">Ödeme geçmişi</h2>
          <ul className="card mt-3 divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink-2">{formatDate(p.paid_at ?? p.created_at, { weekday: undefined, year: "numeric" })}</span>
                <span>{p.plan_id ? (plans?.find((x) => x.id === p.plan_id)?.name ?? p.plan_id) : "Bakiye yükleme"}</span>
                <span className="tabular-nums">{formatPrice(p.amount)}</span>
                <span
                  className={`chip ring-1 ${
                    p.status === "paid"
                      ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20"
                      : p.status === "failed"
                        ? "bg-rose-400/10 text-rose-300 ring-rose-400/20"
                        : "bg-white/5 text-ink-3 ring-line"
                  }`}
                >
                  {p.status === "paid" ? "Ödendi" : p.status === "failed" ? "Başarısız" : "Yarım kaldı"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {token && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-2 backdrop-blur-sm sm:p-6">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white">
            <button
              onClick={() => setToken(null)}
              className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-black/70 text-white"
              aria-label="Kapat"
            >
              <X className="size-4" />
            </button>
            <iframe src={`https://www.paytr.com/odeme/guvenli/${token}`} title="PayTR güvenli ödeme" className="h-[80vh] w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

function Feature({ children, off }: { children: React.ReactNode; off?: boolean }) {
  return (
    <li className={`flex gap-2.5 ${off ? "text-ink-3 line-through" : "text-ink-2"}`}>
      <span className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full ${off ? "bg-white/5" : "bg-brand-400/15"}`}>
        {off ? <X className="size-3" /> : <Check className="size-3 text-brand-300" style={{ strokeWidth: 2.5 }} />}
      </span>
      {children}
    </li>
  );
}
