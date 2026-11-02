"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
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

      <CouponRedeem />

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
