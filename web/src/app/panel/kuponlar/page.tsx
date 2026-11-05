"use client";

import { useCallback, useEffect, useState } from "react";
import { Cake, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { CouponForm } from "@/components/coupon-form";
import { CouponRedeem } from "@/components/coupon-redeem";
import { createClient } from "@/lib/supabase/client";
import { isShowcase } from "@/lib/constants";
import { errorMessage } from "@/lib/format";
import { formatCouponWhen, formatDiscount } from "@/lib/coupons";
import type { Coupon, Service } from "@/lib/types";

export default function CouponsPage() {
  return (
    <PlanGate feature="coupons" title="Kupon">
      <Coupons />
    </PlanGate>
  );
}

// Doğum günü kuponu: müşterinin doğum gününe 3 gün kala kendine özel kupon gider (claim_birthday_gifts).
function BirthdayCoupon() {
  const { business, refresh } = useBusiness();
  const on = business.birthday_discount_type !== null;
  const [type, setType] = useState<"percent" | "fixed">(business.birthday_discount_type ?? "percent");
  const [value, setValue] = useState(String(business.birthday_discount_value ?? 20));
  const [summary, setSummary] = useState<{ sent: number; used: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .rpc("business_birthday_summary", { p_business_id: business.id })
      .then(({ data }) => setSummary(data as { sent: number; used: number } | null));
  }, [business.id]);

  async function save(enable: boolean) {
    setError("");
    const n = Number(value.replace(",", "."));
    if (enable && (!Number.isFinite(n) || n <= 0 || (type === "percent" && (n < 1 || n > 90)))) {
      return setError(type === "percent" ? "Yüzde 1 ile 90 arasında olmalı." : "Tutarı girin.");
    }
    setBusy(true);
    const { error } = await createClient()
      .from("businesses")
      .update(enable ? { birthday_discount_type: type, birthday_discount_value: n } : { birthday_discount_type: null, birthday_discount_value: null })
      .eq("id", business.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    refresh();
  }

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-semibold">
            <Cake className="size-4 text-gold" /> Doğum günü kuponu {on && <span className="chip bg-emerald-400/10 text-ok">Açık</span>}
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            Doğum gününü hesabına ekleyen müşterilerinize (randevusu gerçekleşmiş ya da sizi favorilemiş) doğum gününe 3 gün kala kendine özel kupon
            gider; doğum gününden 7 gün sonrasına kadar geçerlidir.
          </p>
          {summary && summary.sent > 0 && (
            <p className="mt-1 text-sm">
              Bu yıl {summary.sent} müşteriye gönderildi, {summary.used} tanesi kullanıldı.
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label="İndirim türü" className="input w-auto" value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")}>
          <option value="percent">Yüzde</option>
          <option value="fixed">Tutar (₺)</option>
        </select>
        <input aria-label="İndirim" inputMode="decimal" className="input w-24" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
          {on ? "Güncelle" : "Aç"}
        </button>
        {on && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
            Kapat
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}

function Coupons() {
  const { business } = useBusiness();
  const supabase = createClient();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  // editing: null kapalı, "new" yeni kupon, Coupon düzenleme
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [error, setError] = useState("");
  const showcase = isShowcase(business);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.rpc("business_coupons", { p_business_id: business.id }),
      showcase
        ? Promise.resolve({ data: [] })
        : supabase.from("services").select("*").eq("business_id", business.id).order("sort_order").order("created_at"),
    ]);
    if (c.error) setError(errorMessage(c.error));
    setCoupons((c.data ?? []) as Coupon[]);
    setServices((s.data ?? []) as Service[]);
  }, [supabase, business.id, showcase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kuponları ilk açılışta yükle
    load();
  }, [load]);

  async function toggleActive(c: Coupon) {
    setError("");
    const { error } = await supabase.rpc("set_coupon_active", { p_id: c.id, p_active: !c.is_active });
    if (error) return setError(errorMessage(error));
    load();
  }

  async function remove(c: Coupon) {
    if (!confirm(`"${c.title}" kuponunu silmek istiyor musunuz?`)) return;
    setError("");
    const { error } = await supabase.rpc("delete_coupon", { p_id: c.id });
    if (error) return setError(errorMessage(error));
    load();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kuponlar</h1>
          <p className="text-sm text-ink-3">Müşterilerinize gerçek indirim verin; kasada kodla kullandırın.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Kupon aç
        </button>
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      <CouponRedeem onChange={load} />
      <BirthdayCoupon />

      {editing && (
        <CouponForm
          key={editing === "new" ? "new" : editing.id}
          coupon={editing === "new" ? null : editing}
          services={services}
          showServices={!showcase}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ul className="mt-6 space-y-2">
        {coupons === null && <li className="card h-20 animate-pulse bg-surface-2" />}
        {coupons?.length === 0 && !editing && <li className="card p-10 text-center text-ink-3">Henüz kupon yok. İlk kuponunuzu açın.</li>}
        {coupons?.map((c) => (
          <li key={c.id} className={`card flex items-center gap-4 p-4 ${c.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {c.title} {!c.is_active && <span className="chip ml-1 bg-surface-3 text-ink-2">Durduruldu</span>}
              </p>
              <p className="text-sm text-ink-3">
                {formatDiscount(c)} · {formatCouponWhen(c)}
              </p>
              <p className="text-sm text-ink-3">
                {c.claimed} alındı · {c.used} kullanıldı{c.total_limit ? ` · sınır ${c.total_limit}` : ""}
              </p>
            </div>
            <button className="btn btn-ghost px-2.5" aria-label="Düzenle" onClick={() => setEditing(c)}>
              <Pencil className="size-4" />
            </button>
            {c.claimed > 0 ? (
              <button className="btn btn-ghost px-2.5" aria-label={c.is_active ? "Durdur" : "Yeniden başlat"} onClick={() => toggleActive(c)}>
                {c.is_active ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
            ) : (
              <button className="btn btn-ghost px-2.5 text-rose-400" aria-label="Sil" onClick={() => remove(c)}>
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
