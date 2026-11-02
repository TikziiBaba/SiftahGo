"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { ImageButton } from "@/components/image-button";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { createClient } from "@/lib/supabase/client";
import { menuLabel } from "@/lib/constants";
import { errorMessage, formatPrice } from "@/lib/format";
import { uploadImage } from "@/lib/upload";
import type { MenuItem } from "@/lib/types";

// Veritabanındaki sınırla aynı (enforce_menu_limit).
const MAX_ITEMS = 200;
const EMPTY = { category: "", name: "", description: "", price: "", image_url: null as string | null, is_active: true };

export default function MenuPage() {
  return (
    <PlanGate feature="menu" title="Menü">
      <Menu />
    </PlanGate>
  );
}

function Menu() {
  const { business } = useBusiness();
  const supabase = createClient();
  const label = menuLabel(business.category);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; values: typeof EMPTY } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("menu_items").select("*").eq("business_id", business.id).order("sort_order").order("created_at");
    setItems(((data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) })));
  }, [supabase, business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- menüyü ilk açılışta yükle
    load();
  }, [load]);

  // Kategori grupları, ilk görüldükleri sırayla; kategorisiz ürünler en sonda.
  const groups = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const i of items ?? []) map.set(i.category, [...(map.get(i.category) ?? []), i]);
    const named = [...map.entries()].filter(([c]) => c);
    const none = map.get("");
    return none ? [...named, ["", none] as [string, MenuItem[]]] : named;
  }, [items]);
  const categories = useMemo(() => groups.map(([c]) => c).filter(Boolean), [groups]);
  const full = (items?.length ?? 0) >= MAX_ITEMS;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const v = editing.values;
    const values = {
      category: v.category.trim(),
      name: v.name.trim(),
      description: v.description.trim(),
      price: Number(v.price),
      image_url: v.image_url,
      is_active: v.is_active,
    };
    const { error } = editing.id
      ? await supabase.from("menu_items").update(values).eq("id", editing.id)
      : await supabase
          .from("menu_items")
          .insert({ ...values, business_id: business.id, sort_order: Math.max(-1, ...(items ?? []).map((i) => i.sort_order)) + 1 });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEditing(null);
    load();
  }

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadImage(files[0], "menu");
      setEditing((cur) => (cur ? { ...cur, values: { ...cur.values, image_url: url } } : cur));
    } catch (err) {
      setError((err as Error).message);
    }
    setUploading(false);
  }

  async function toggle(i: MenuItem) {
    setError("");
    const { error } = await supabase.from("menu_items").update({ is_active: !i.is_active }).eq("id", i.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  async function remove(i: MenuItem) {
    if (!confirm(`"${i.name}" silinsin mi?`)) return;
    setError("");
    const { error } = await supabase.from("menu_items").delete().eq("id", i.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  // Aynı kategorideki komşuyla yer değiştirir; sıra numaraları 0..n-1 olarak yeniden yazılır (eşit numaralar olsa da çalışır).
  async function move(i: MenuItem, dir: -1 | 1) {
    if (!items) return;
    const group = items.filter((x) => x.category === i.category);
    const other = group[group.findIndex((x) => x.id === i.id) + dir];
    if (!other) return;
    const order = items.map((x) => x.id);
    const a = order.indexOf(i.id);
    const b = order.indexOf(other.id);
    [order[a], order[b]] = [order[b], order[a]];
    setError("");
    const results = await Promise.all(
      order.map((id, n) => (items.find((x) => x.id === id)!.sort_order === n ? null : supabase.from("menu_items").update({ sort_order: n }).eq("id", id))),
    );
    const failed = results.find((r) => r?.error);
    if (failed?.error) setError(errorMessage(failed.error));
    load();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          <p className="text-sm text-ink-3">
            {label === "Menü" ? "Yemek ve içeceklerinizi" : "Ürünlerinizi"} fiyatıyla sayfanızda gösterin.{items ? ` ${items.length}/${MAX_ITEMS}` : ""}
          </p>
        </div>
        <button className="btn btn-primary" disabled={full} onClick={() => setEditing({ id: null, values: EMPTY })}>
          <Plus className="size-4" /> Ekle
        </button>
      </div>

      {full && <p className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">En fazla {MAX_ITEMS} ürün ekleyebilirsiniz.</p>}
      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {editing && (
        <form onSubmit={save} className="card mt-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Ürün adı</label>
            <input
              required
              maxLength={100}
              className="input"
              placeholder={label === "Menü" ? "Örn. Mercimek çorbası" : "Örn. Zeytinyağı 1 lt"}
              value={editing.values.name}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, name: e.target.value } })}
            />
          </div>
          <div>
            <label className="label">Fiyat (₺)</label>
            <input
              required
              type="number"
              min={0}
              step="any"
              className="input"
              value={editing.values.price}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, price: e.target.value } })}
            />
          </div>
          <div>
            <label className="label">Kategori (isteğe bağlı)</label>
            <input
              list="menu-categories"
              maxLength={60}
              className="input"
              placeholder="Örn. Çorbalar"
              value={editing.values.category}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, category: e.target.value } })}
            />
            <datalist id="menu-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Açıklama (isteğe bağlı)</label>
            <input
              maxLength={300}
              className="input"
              value={editing.values.description}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, description: e.target.value } })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {editing.values.image_url && <img src={editing.values.image_url} alt="" className="size-16 rounded-xl object-cover ring-1 ring-line" />}
            <ImageButton label={editing.values.image_url ? "Fotoğrafı değiştir" : "Fotoğraf ekle (isteğe bağlı)"} busy={uploading} onPick={onPick} />
            {editing.values.image_url && (
              <button
                type="button"
                className="btn btn-ghost text-rose-400"
                onClick={() => setEditing({ ...editing, values: { ...editing.values, image_url: null } })}
              >
                <X className="size-4" /> Kaldır
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-brand-400"
              checked={editing.values.is_active}
              onChange={(e) => setEditing({ ...editing, values: { ...editing.values, is_active: e.target.checked } })}
            />
            Sayfamda göster
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy || uploading} className="btn btn-primary">
              {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 space-y-6">
        {items === null && <div className="card h-20 animate-pulse bg-surface-2" />}
        {items?.length === 0 && !editing && <div className="card p-10 text-center text-ink-3">Henüz ürün yok. İlk ürününüzü ekleyin.</div>}
        {groups.map(([category, list]) => (
          <section key={category || "diger"}>
            {(category || groups.length > 1) && (
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-ink-3">{category || "Kategorisiz"}</h2>
            )}
            <ul className="space-y-2">
              {list.map((i, n) => (
                <li key={i.id} className={`card flex items-center gap-3 p-3 ${i.is_active ? "" : "opacity-60"}`}>
                  {i.image_url ? (
                    <img src={i.image_url} alt="" className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-line" />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg font-semibold text-ink-3">
                      {i.name.charAt(0).toLocaleUpperCase("tr")}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {i.name} {!i.is_active && <span className="chip ml-1 bg-surface-3 text-ink-2">Gizli</span>}
                    </p>
                    <p className="truncate text-sm text-ink-3">
                      {formatPrice(i.price)}
                      {i.description && ` · ${i.description}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button className="btn btn-ghost px-2" aria-label="Yukarı taşı" disabled={n === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button className="btn btn-ghost px-2" aria-label="Aşağı taşı" disabled={n === list.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button className="btn btn-ghost px-2" aria-label={i.is_active ? "Gizle" : "Göster"} onClick={() => toggle(i)}>
                      {i.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                    <button
                      className="btn btn-ghost px-2"
                      aria-label="Düzenle"
                      onClick={() =>
                        setEditing({
                          id: i.id,
                          values: { category: i.category, name: i.name, description: i.description, price: String(i.price), image_url: i.image_url, is_active: i.is_active },
                        })
                      }
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button className="btn btn-ghost px-2 text-rose-400" aria-label="Sil" onClick={() => remove(i)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
