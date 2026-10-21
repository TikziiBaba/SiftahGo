"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Section } from "@/components/admin/ui";
import { DropZone } from "@/components/drop-zone";
import { DynamicButton } from "@/components/dynamic-button";
import { ImageButton } from "@/components/image-button";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CITIES, RESERVED_SLUGS, SITE_DOMAIN } from "@/lib/constants";
import { errorMessage, slugInput, slugify } from "@/lib/format";
import { uploadImage } from "@/lib/upload";
import type { Business } from "@/lib/types";

type Kind = "logo" | "cover" | "gallery";

/** Yöneticinin işletme bilgilerini ve görsellerini düzenlemesi. Abonelik, askı ve onay alanlarını veritabanı korur. */
export function BusinessEdit({ business: b, onClose, onDone }: { business: Business; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: b.name,
    slug: b.slug,
    category: b.category,
    phone: b.phone,
    city: b.city,
    district: b.district,
    address: b.address,
    description: b.description,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  /** Başarıda success yazısı gösterilir (verilmediyse hiçbir şey); başarılıysa true döner. */
  async function update(patch: Partial<Business>, success?: string) {
    // Yetki yoksa RLS hata vermez, satır güncellenmez; boş dönüş de hata sayılır.
    const { data, error } = await createClient().from("businesses").update(patch).eq("id", b.id).select("id");
    const ok = !error && !!data?.length;
    if (error) setMessage({ ok: false, text: errorMessage(error) });
    else if (!ok) setMessage({ ok: false, text: "Değişiklik kaydedilemedi: düzenleme yetkiniz yok." });
    else if (success) setMessage({ ok: true, text: success });
    await onDone();
    return ok;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugify(form.slug);
    if (slug.length < 3 || RESERVED_SLUGS.includes(slug)) {
      return setMessage({ ok: false, text: "En az 3 karakterlik farklı bir sayfa adresi seçin." });
    }
    setBusy(true);
    setMessage(null);
    const ok = await update({ ...form, slug, name: form.name.trim() });
    setBusy(false);
    // Başarı düğmede görünür ("Kaydedildi"), biraz sonra düğme eski haline döner.
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function onPick(kind: Kind, files: FileList | null) {
    if (!files?.length) return;
    setUploading(kind);
    setMessage(null);
    try {
      if (kind === "gallery") {
        const urls: string[] = [];
        for (const f of Array.from(files).slice(0, 12 - b.gallery.length)) urls.push(await uploadImage(f, "gallery", b.id));
        await update({ gallery: [...b.gallery, ...urls] }, "Fotoğraflar eklendi.");
      } else {
        const url = await uploadImage(files[0], kind, b.id);
        await update(kind === "logo" ? { logo_url: url } : { cover_url: url }, kind === "logo" ? "Logo değişti." : "Kapak değişti.");
      }
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
    setUploading(null);
  }

  return (
    <Section
      title="İşletmeyi düzenle"
      className="mt-4 ring-1 ring-gold/20"
      action={
        <button type="button" onClick={onClose} aria-label="Kapat" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-tint/5 hover:text-ink">
          <X className="size-4" />
        </button>
      }
    >
      {message && (
        <p className={`mt-3 rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-500/10 text-bad"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="size-16 overflow-hidden rounded-2xl bg-brand-700">
              {b.logo_url ? (
                <img src={b.logo_url} alt="Logo" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-xl font-bold text-white">{b.name.charAt(0)}</span>
              )}
            </div>
            <ImageButton label="Logo yükle" busy={uploading === "logo"} onPick={(f) => onPick("logo", f)} />
            {b.logo_url && (
              <button type="button" className="btn btn-ghost text-rose-400" onClick={() => update({ logo_url: null }, "Logo kaldırıldı.")}>
                Kaldır
              </button>
            )}
          </div>

          <div>
            <div className="h-28 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-surface-2">
              {b.cover_url && <img src={b.cover_url} alt="Kapak" className="size-full object-cover" />}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <ImageButton label="Kapak yükle" busy={uploading === "cover"} onPick={(f) => onPick("cover", f)} />
              {b.cover_url && (
                <button type="button" className="btn btn-ghost text-rose-400" onClick={() => update({ cover_url: null }, "Kapak kaldırıldı.")}>
                  Kaldır
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="label">Galeri ({b.gallery.length}/12)</p>
            {b.gallery.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {b.gallery.map((url) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      aria-label="Kaldır"
                      onClick={() => update({ gallery: b.gallery.filter((u) => u !== url) }, "Fotoğraf kaldırıldı.")}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {b.gallery.length < 12 && (
              <div className="mt-2">
                <DropZone
                  label="Fotoğraf ekle"
                  hint={`Sürükleyip bırakın ya da tıklayıp seçin · ${12 - b.gallery.length} yer kaldı`}
                  multiple
                  busy={uploading === "gallery"}
                  onPick={(f) => onPick("gallery", f)}
                />
              </div>
            )}
          </div>
        </div>

        <form onSubmit={save} className="grid content-start gap-3 sm:grid-cols-2">
          <div>
            <label className="label">İşletme adı</label>
            <input required className="input" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="label">Sayfa adresi</label>
            <input required className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugInput(e.target.value) })} />
            <p className="mt-1 truncate text-xs text-ink-3">{SITE_DOMAIN}/{slugify(form.slug)}</p>
          </div>
          <div>
            <label className="label">Kategori</label>
            <select className="input" value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Telefon</label>
            <input type="tel" className="input" value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="label">Şehir</label>
            <select className="input" value={form.city} onChange={set("city")}>
              <option value="">Seçin</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">İlçe</label>
            <input className="input" value={form.district} onChange={set("district")} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Adres</label>
            <input className="input" value={form.address} onChange={set("address")} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Hakkında</label>
            <textarea rows={4} className="input" value={form.description} onChange={set("description")} />
          </div>
          <div className="sm:col-span-2">
            <DynamicButton
              disabled={busy}
              className="btn btn-primary px-6"
              icon={busy ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : undefined}
            >
              {busy ? "Kaydediliyor" : saved ? "Kaydedildi" : "Kaydet"}
            </DynamicButton>
          </div>
        </form>
      </div>
    </Section>
  );
}
