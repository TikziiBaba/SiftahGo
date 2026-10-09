"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Info, Loader2, Plus } from "lucide-react";
import { PageTitle, Skeleton } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { PLAN_FEATURES } from "@/lib/constants";
import { errorMessage, formatPrice, slugify } from "@/lib/format";
import type { Plan } from "@/lib/types";

type Draft = { id: string; name: string; price: string; staff_limit: string; features: string[]; sort_order: string };

const toDraft = (p: Plan): Draft => ({
  id: p.id,
  name: p.name,
  price: String(Number(p.price)),
  staff_limit: p.staff_limit === null ? "" : String(p.staff_limit),
  features: p.features,
  sort_order: String(p.sort_order),
});

const fromDraft = (d: Draft) => ({
  name: d.name.trim(),
  price: Number(d.price),
  staff_limit: d.staff_limit.trim() === "" ? null : Number(d.staff_limit),
  features: d.features,
  sort_order: Number(d.sort_order) || 0,
});

const EMPTY: Draft = { id: "", name: "", price: "", staff_limit: "", features: [], sort_order: "" };

export default function AdminPlans() {
  const [data, setData] = useState<{ plans: Plan[]; subscribers: Record<string, number> } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [p, b] = await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("businesses").select("plan_id").gt("subscription_ends_at", new Date().toISOString()),
    ]);
    const subscribers: Record<string, number> = {};
    for (const x of (b.data ?? []) as { plan_id: string | null }[]) if (x.plan_id) subscribers[x.plan_id] = (subscribers[x.plan_id] ?? 0) + 1;
    setData({ plans: (p.data ?? []) as Plan[], subscribers });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paketleri ilk açılışta yükle
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Paketler" hint="Fiyatlar aylıktır (TL). Değişiklik sitede ve yeni ödemelerde hemen geçerli olur." />

      <p className="mt-4 flex gap-2 rounded-2xl bg-sky-400/10 p-4 text-sm text-sky-200 ring-1 ring-sky-400/20">
        <Info className="mt-0.5 size-4 shrink-0" />
        Mevcut aboneler ödedikleri süre boyunca etkilenmez; yeni fiyat bir sonraki ödemelerinde uygulanır. Personel sınırı düşürülürse
        işletmeler yeni personel ekleyemez, mevcut personeli bir sonraki ödemede pasif olur.
      </p>

      {!data ? (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-96" />)}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.plans.map((p) => (
            <PlanCard key={p.id} plan={p} subscribers={data.subscribers[p.id] ?? 0} onSaved={load} />
          ))}
          <NewPlan nextOrder={Math.max(0, ...data.plans.map((p) => p.sort_order)) + 1} existing={data.plans.map((p) => p.id)} onSaved={load} />
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, subscribers, onSaved }: { plan: Plan; subscribers: number; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => toDraft(plan));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(plan));

  async function save() {
    const values = fromDraft(draft);
    const problem = validate(values);
    if (problem) return setMessage({ ok: false, text: problem });
    setBusy(true);
    setMessage(null);
    const { error, data } = await createClient().from("plans").update(values).eq("id", plan.id).select("id");
    setBusy(false);
    if (error || !data?.length) return setMessage({ ok: false, text: error ? errorMessage(error) : "Kaydedilemedi (yetki yok)." });
    setMessage({ ok: true, text: "Kaydedildi." });
    await onSaved();
  }

  return (
    <div className="bezel">
      <div className="bezel-core flex h-full flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs text-ink-4">{plan.id}</p>
          <span className="chip bg-white/5 text-ink-2 ring-1 ring-line">{subscribers} aktif abone</span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">
          {formatPrice(Number(draft.price) || 0)}
          <span className="text-base font-normal text-ink-3"> / ay</span>
        </p>
        <p className="text-xs text-ink-3">Aylık gelir katkısı: {formatPrice(plan.price * subscribers)}</p>
        <Fields draft={draft} setDraft={setDraft} />
        {message && <p className={`mt-3 text-sm ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!dirty || busy} onClick={save} className="btn btn-primary flex-1">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Kaydet
          </button>
          {dirty && (
            <button type="button" onClick={() => setDraft(toDraft(plan))} className="btn btn-ghost">
              Vazgeç
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewPlan({ nextOrder, existing, onSaved }: { nextOrder: number; existing: string[]; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, sort_order: String(nextOrder) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = slugify(draft.name);

  async function create() {
    const values = fromDraft(draft);
    const problem = validate(values) || (!id ? "Paket adı girin." : existing.includes(id) ? "Bu adla bir paket zaten var." : "");
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const { error } = await createClient().from("plans").insert({ id, ...values });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setOpen(false);
    setDraft({ ...EMPTY, sort_order: String(nextOrder + 1) });
    await onSaved();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid min-h-60 place-items-center rounded-[2rem] border border-dashed border-line-strong text-sm text-ink-3 transition hover:border-brand-400/40 hover:text-brand-300"
      >
        <span className="flex flex-col items-center gap-2">
          <Plus className="size-6" /> Yeni paket ekle
        </span>
      </button>
    );
  }

  return (
    <div className="bezel ring-brand-400/30">
      <div className="bezel-core flex h-full flex-col p-5">
        <p className="font-semibold">Yeni paket</p>
        <p className="text-xs text-ink-3">Kod: <span className="font-mono">{id || "—"}</span> (addan oluşur, sonradan değişmez)</p>
        <Fields draft={draft} setDraft={setDraft} />
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={create} className="btn btn-primary flex-1">
            {busy && <Loader2 className="size-4 animate-spin" />} Ekle
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}

function Fields({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  return (
    <div className="mt-4 flex-1 space-y-3">
      <label className="block">
        <span className="label text-xs">Paket adı</span>
        <input className="input" value={draft.name} onChange={set("name")} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="label text-xs">Fiyat (₺)</span>
          <input className="input" type="number" min={1} value={draft.price} onChange={set("price")} />
        </label>
        <label className="block">
          <span className="label text-xs">Personel</span>
          <input className="input" type="number" min={1} placeholder="Sınırsız" value={draft.staff_limit} onChange={set("staff_limit")} />
        </label>
        <label className="block">
          <span className="label text-xs">Sıra</span>
          <input className="input" type="number" value={draft.sort_order} onChange={set("sort_order")} />
        </label>
      </div>
      <fieldset>
        <legend className="label text-xs">Ek özellikler</legend>
        <div className="space-y-1.5">
          {Object.entries(PLAN_FEATURES).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="size-4 accent-brand-400"
                checked={draft.features.includes(key)}
                onChange={(e) =>
                  setDraft({ ...draft, features: e.target.checked ? [...draft.features, key] : draft.features.filter((f) => f !== key) })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function validate(v: ReturnType<typeof fromDraft>) {
  if (!v.name) return "Paket adı boş olamaz.";
  if (!(v.price > 0)) return "Fiyat 0'dan büyük olmalı.";
  if (v.staff_limit !== null && !(Number.isInteger(v.staff_limit) && v.staff_limit > 0)) return "Personel sınırı pozitif tam sayı olmalı (boş = sınırsız).";
  return "";
}
