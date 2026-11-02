"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, errorMessage, todayStr } from "@/lib/format";
import type { Coupon, Service } from "@/lib/types";

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** Kupon açma ve düzenleme formu. İlk alımdan sonra tür, değer, gün-saat ve hizmetler kilitlenir. */
export function CouponForm({
  coupon,
  services,
  showServices = true,
  onSaved,
  onCancel,
}: {
  coupon: Coupon | null;
  services: Service[];
  /** Vitrin işletmede hizmet yoktur; hizmet seçimi gizlenir. */
  showServices?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const locked = !!coupon && coupon.claimed > 0;
  const [title, setTitle] = useState(coupon?.title ?? "");
  const [type, setType] = useState<"percent" | "fixed">(coupon?.discount_type ?? "percent");
  const [value, setValue] = useState(coupon ? String(Number(coupon.discount_value)) : "");
  const [starts, setStarts] = useState(coupon?.starts_on ?? todayStr());
  const [ends, setEnds] = useState(coupon?.ends_on ?? addDays(todayStr(), 29));
  const [weekdays, setWeekdays] = useState<number[]>(coupon?.weekdays ?? []);
  const [startTime, setStartTime] = useState(coupon?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(coupon?.end_time?.slice(0, 5) ?? "");
  const [limit, setLimit] = useState(coupon?.total_limit ? String(coupon.total_limit) : "");
  const [serviceIds, setServiceIds] = useState<string[]>(coupon?.service_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().rpc("save_coupon", {
      p_id: coupon?.id ?? null,
      p_title: title.trim(),
      p_type: type,
      p_value: Number(value),
      p_starts: starts,
      p_ends: ends,
      p_weekdays: weekdays,
      p_start: startTime || null,
      p_end: endTime || null,
      p_limit: limit ? Number(limit) : null,
      p_services: serviceIds,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <form onSubmit={save} className="card mt-6 grid gap-3 p-5 sm:grid-cols-2">
      {locked && (
        <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200 sm:col-span-2">
          Bu kupon {coupon.claimed} kez alındı. İndirim, gün-saat aralığı ve hizmetler artık değişmez; başlık, daha geç bir bitiş tarihi ve daha yüksek bir
          sınır girebilirsiniz.
        </p>
      )}
      <div className="sm:col-span-2">
        <label className="label">Başlık</label>
        <input required maxLength={80} className="input" placeholder="Örn. Hafta içi öğle indirimi" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label">İndirim türü</label>
        <select disabled={locked} className="input" value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")}>
          <option value="percent">Yüzde (%)</option>
          <option value="fixed">Sabit tutar (₺)</option>
        </select>
      </div>
      <div>
        <label className="label">{type === "percent" ? "Yüzde (1-90)" : "Tutar (₺)"}</label>
        <input
          required
          disabled={locked}
          type="number"
          min={type === "percent" ? 1 : 0.01}
          max={type === "percent" ? 90 : 100000}
          step="any"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Başlangıç</label>
        <input required type="date" className="input" value={starts} max={locked ? coupon.starts_on : undefined} onChange={(e) => setStarts(e.target.value)} />
      </div>
      <div>
        <label className="label">Bitiş (en fazla 90 gün)</label>
        <input required type="date" className="input" value={ends} min={locked ? coupon.ends_on : undefined} onChange={(e) => setEnds(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Geçerli günler (hiçbiri seçili değilse her gün)</label>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((name, i) => (
            <label key={name} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                disabled={locked}
                className="size-4 accent-brand-400"
                checked={weekdays.includes(i + 1)}
                onChange={() => setWeekdays(toggle(weekdays, i + 1))}
              />
              {name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Başlangıç saati (isteğe bağlı)</label>
        <input disabled={locked} type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div>
        <label className="label">Bitiş saati</label>
        <input disabled={locked} type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Toplam sınır (boşsa sınırsız)</label>
        <input
          type="number"
          min={locked && coupon.total_limit ? coupon.total_limit : 1}
          step={1}
          disabled={locked && coupon.total_limit === null}
          className="input"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </div>
      {showServices && (
      <div className="sm:col-span-2">
        <label className="label">Geçerli hizmetler (hiçbiri seçili değilse hepsi)</label>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                disabled={locked}
                className="size-4 accent-brand-400"
                checked={serviceIds.includes(s.id)}
                onChange={() => setServiceIds(toggle(serviceIds, s.id))}
              />
              {s.name}
            </label>
          ))}
          {services.length === 0 && <p className="text-sm text-ink-3">Henüz hizmet yok; kupon tüm hizmetlerde geçer.</p>}
        </div>
      </div>
      )}
      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}
