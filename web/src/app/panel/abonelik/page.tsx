"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { BASE_FEATURES, isSubscribed, PLAN_FEATURES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/format";
import type { Payment, Plan } from "@/lib/types";

const POPULAR = "esnaf";

export default function SubscriptionPage() {
  const { business, refresh } = useBusiness();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  // PayTR ödeme sonrası buraya ?odeme=basarili|hata ile döner.
  const [result] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(location.search).get("odeme")));
  const [waiting, setWaiting] = useState(result === "basarili");
  const startEnds = useRef(business.subscription_ends_at);

  const subscribed = isSubscribed(business);
  const currentPlan = plans?.find((p) => p.id === business.plan_id);

  useEffect(() => {
    // Ödeme sayfası iframe içinde döndüyse ana pencereyi yönlendir.
    if (result && window.top && window.top !== window.self) window.top.location.href = location.href;
  }, [result]);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("payments").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(20),
    ]).then(([p, pay]) => {
      setPlans((p.data ?? []) as Plan[]);
      setPayments((pay.data ?? []) as Payment[]);
    });
  }, [business.id, business.subscription_ends_at]);

  // Ödeme onayı (PayTR bildirimi) birkaç saniye sürebilir; gelene kadar yokla.
  useEffect(() => {
    if (!waiting) return;
    if (business.subscription_ends_at !== startEnds.current) {
      setWaiting(false);
      history.replaceState(null, "", "/panel/abonelik");
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      refresh();
      if (tries >= 20) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, business.subscription_ends_at, refresh]);

  async function buy(planId: string) {
    setBusyPlan(planId);
    setError("");
    const res = await fetch("/api/paytr/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const json = await res.json();
    setBusyPlan(null);
    if (!res.ok) return setError(json.error ?? "Ödeme başlatılamadı.");
    setToken(json.token);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Abonelik</h1>
      <p className="mt-1 text-sm text-ink-3">Paketler aylıktır. Taahhüt yok; her ödeme 30 gün geçerlidir ve kalan sürenize eklenir.</p>

      {waiting && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-400/10 p-4 text-sm text-brand-200 ring-1 ring-brand-400/20">
          <Loader2 className="size-5 animate-spin" /> Ödemeniz alındı, onay bekleniyor. Bu birkaç saniye sürebilir…
        </div>
      )}
      {result === "basarili" && !waiting && subscribed && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
          <CheckCircle2 className="size-5" /> Teşekkürler! Aboneliğiniz aktif. Sayfanız yayında ve randevu alabilirsiniz.
        </div>
      )}
      {result === "hata" && (
        <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300 ring-1 ring-rose-400/20">
          Ödeme tamamlanamadı. Kartınızdan çekim yapılmadı; tekrar deneyebilirsiniz.
        </p>
      )}
      {error && <p className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300 ring-1 ring-rose-400/20">{error}</p>}

      <div className="bezel mt-6">
        <div className="bezel-core flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-4">Mevcut durum</p>
            {subscribed ? (
              <p className="mt-1 text-lg font-semibold">
                {currentPlan?.name ?? "Paket"} paketi ·{" "}
                <span className="font-normal text-ink-2">{formatDate(business.subscription_ends_at!, { weekday: undefined, year: "numeric" })} tarihine kadar</span>
              </p>
            ) : (
              <p className="mt-1 text-lg font-semibold text-amber-300">Aktif paketiniz yok</p>
            )}
          </div>
          {!subscribed && (
            <p className="max-w-sm text-sm text-ink-3">
              Paket seçene kadar sayfanız yayında görünmez ve randevu alınamaz. Ayarlar’dan bilgilerinizi şimdiden doldurabilirsiniz.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans === null &&
          Array.from({ length: 3 }, (_, i) => <div key={i} className="h-96 animate-pulse rounded-[2rem] bg-surface-2" />)}
        {plans?.map((plan) => {
          const isCurrent = subscribed && plan.id === business.plan_id;
          const popular = plan.id === POPULAR;
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
                  onClick={() => buy(plan.id)}
                  className={`btn relative mt-8 w-full py-3 ${popular ? "btn-primary" : "btn-secondary"}`}
                >
                  {busyPlan === plan.id && <Loader2 className="size-4 animate-spin" />}
                  {isCurrent ? "30 gün uzat" : subscribed ? "Bu pakete geç" : "Seç ve öde"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-ink-3">
        <ShieldCheck className="size-4 text-brand-300" /> Ödemeler PayTR güvencesiyle alınır; kart bilgileriniz bize ulaşmaz.
        Küçük pakete geçerseniz fazla personel pasif olur.
      </p>

      {payments.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold">Ödeme geçmişi</h2>
          <ul className="card mt-3 divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink-2">{formatDate(p.paid_at ?? p.created_at, { weekday: undefined, year: "numeric" })}</span>
                <span>{plans?.find((x) => x.id === p.plan_id)?.name ?? p.plan_id}</span>
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
    <li className={`flex gap-2.5 ${off ? "text-ink-4 line-through" : "text-ink-2"}`}>
      <span className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full ${off ? "bg-white/5" : "bg-brand-400/15"}`}>
        {off ? <X className="size-3" /> : <Check className="size-3 text-brand-300" style={{ strokeWidth: 2.5 }} />}
      </span>
      {children}
    </li>
  );
}
