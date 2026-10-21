"use client";

import { useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { BlockedCustomers } from "@/components/blocked-customers";
import { BusinessLocation } from "@/components/business-location";
import { PageAppearance } from "@/components/page-appearance";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CITIES, CONFIRM_MODES, confirmMode, RESERVED_SLUGS, SITE_DOMAIN } from "@/lib/constants";
import { errorMessage, slugInput, slugify } from "@/lib/format";
import { uploadImage } from "@/lib/upload";

const SLOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const NOTICE_OPTIONS = [
  [0, "Hemen"], [30, "30 dakika önce"], [60, "1 saat önce"], [120, "2 saat önce"],
  [240, "4 saat önce"], [720, "12 saat önce"], [1440, "1 gün önce"],
] as const;

export default function SettingsPage() {
  const { business, refresh } = useBusiness();
  const [form, setForm] = useState({
    name: business.name,
    slug: business.slug,
    category: business.category,
    description: business.description,
    phone: business.phone,
    city: business.city,
    district: business.district,
    address: business.address,
    slot_minutes: business.slot_minutes,
    booking_days: business.booking_days,
    min_notice_minutes: business.min_notice_minutes,
    auto_confirm: business.auto_confirm,
    auto_confirm_known_only: business.auto_confirm_known_only,
    is_published: business.is_published,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.type === "number" || k === "slot_minutes" || k === "min_notice_minutes" ? Number(e.target.value) : e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugify(form.slug);
    if (slug.length < 3 || RESERVED_SLUGS.includes(slug)) {
      return setMessage({ ok: false, text: "Lütfen en az 3 karakterlik farklı bir sayfa adresi seçin." });
    }
    setBusy(true);
    const { error } = await createClient().from("businesses").update({ ...form, slug, name: form.name.trim() }).eq("id", business.id);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setMessage({ ok: true, text: "Ayarlar kaydedildi." });
    refresh();
  }

  async function saveImages(patch: { logo_url?: string | null; cover_url?: string | null; gallery?: string[] }) {
    const { error } = await createClient().from("businesses").update(patch).eq("id", business.id);
    if (error) setMessage({ ok: false, text: errorMessage(error) });
    await refresh();
  }

  async function onPick(kind: "logo" | "cover" | "gallery", files: FileList | null) {
    if (!files?.length) return;
    setUploading(kind);
    setMessage(null);
    try {
      if (kind === "gallery") {
        const urls: string[] = [];
        for (const f of Array.from(files).slice(0, 12 - business.gallery.length)) urls.push(await uploadImage(f, "gallery"));
        await saveImages({ gallery: [...business.gallery, ...urls] });
      } else {
        const url = await uploadImage(files[0], kind);
        await saveImages(kind === "logo" ? { logo_url: url } : { cover_url: url });
      }
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
    setUploading(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Görseller</h1>
        <div className="card mt-4 space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="size-20 overflow-hidden rounded-2xl bg-brand-700">
              {business.logo_url ? (
                <img src={business.logo_url} alt="Logo" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-2xl font-bold text-white">{business.name.charAt(0)}</span>
              )}
            </div>
            <ImageButton label="Logo yükle" busy={uploading === "logo"} onPick={(f) => onPick("logo", f)} />
            {business.logo_url && (
              <button className="btn btn-ghost text-rose-400" onClick={() => saveImages({ logo_url: null })}>Kaldır</button>
            )}
          </div>
          <div>
            <div className="h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-surface-2">
              {business.cover_url && <img src={business.cover_url} alt="Kapak" className="size-full object-cover" />}
            </div>
            <div className="mt-3 flex gap-2">
              <ImageButton label="Kapak fotoğrafı yükle" busy={uploading === "cover"} onPick={(f) => onPick("cover", f)} />
              {business.cover_url && (
                <button className="btn btn-ghost text-rose-400" onClick={() => saveImages({ cover_url: null })}>Kaldır</button>
              )}
            </div>
          </div>
          <div>
            <p className="label">Galeri ({business.gallery.length}/12)</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {business.gallery.map((url) => (
                <div key={url} className="group relative">
                  <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  <button
                    aria-label="Kaldır"
                    onClick={() => saveImages({ gallery: business.gallery.filter((u) => u !== url) })}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {business.gallery.length < 12 && (
              <div className="mt-3">
                <ImageButton label="Fotoğraf ekle" multiple busy={uploading === "gallery"} onPick={(f) => onPick("gallery", f)} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Veritabanında sayfa özelleştirme alanları yoksa (ek dosya henüz çalıştırılmadıysa) gizli kalır. */}
      {"accent" in business && <PageAppearance />}

      <form onSubmit={save} className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight">İşletme bilgileri</h2>
          <div className="card mt-4 grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="label">İşletme adı</label>
              <input required className="input" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">Sayfa adresi</label>
              <input required className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugInput(e.target.value) })} />
              <p className="mt-1 text-xs text-ink-3">{SITE_DOMAIN}/{slugify(form.slug)}</p>
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
              <textarea rows={4} className="input" value={form.description} onChange={set("description")} placeholder="İşletmenizi birkaç cümleyle tanıtın." />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold tracking-tight">Randevu kuralları</h2>
          <div className="card mt-4 grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <label className="label">Saat aralığı</label>
              <select className="input" value={form.slot_minutes} onChange={set("slot_minutes")}>
                {SLOT_OPTIONS.map((m) => <option key={m} value={m}>{m} dakikada bir</option>)}
              </select>
            </div>
            <div>
              <label className="label">En erken</label>
              <select className="input" value={form.min_notice_minutes} onChange={set("min_notice_minutes")}>
                {NOTICE_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">En geç (gün sonrası)</label>
              <input type="number" min={1} max={365} className="input" value={form.booking_days} onChange={set("booking_days")} />
            </div>
            <fieldset className="sm:col-span-3">
              <legend className="label">Randevu onayı</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {CONFIRM_MODES.map((m) => {
                  const on = confirmMode(form).id === m.id;
                  return (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-xl p-3 text-sm ring-1 transition ${on ? "bg-brand-400/10 ring-brand-400/40" : "ring-line hover:bg-tint/5"}`}
                    >
                      <input
                        type="radio"
                        name="confirm_mode"
                        className="mt-0.5 size-4 accent-brand-400"
                        checked={on}
                        onChange={() => setForm({ ...form, auto_confirm: m.auto_confirm, auto_confirm_known_only: m.auto_confirm_known_only })}
                      />
                      <span>
                        <b>{m.label}</b>
                        <span className="block text-ink-3">{m.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Sık iptal eden veya randevusuna gelmeyen müşterilerin randevusu her durumda onayınıza düşer. Reddederken yazdığınız sebep
                müşteriye iletilir.
              </p>
            </fieldset>
            <label className="flex items-start gap-2 text-sm sm:col-span-3">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand-400" checked={form.is_published}
                onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
              <span>
                <b>Sayfam yayında</b>
                <span className="block text-ink-3">Kapalıysa işletmeniz aramada görünmez ve randevu alınamaz.</span>
              </span>
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button disabled={busy} className="btn btn-primary px-6">
            {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
          </button>
          {message && <p className={`text-sm ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>{message.text}</p>}
        </div>
      </form>

      {/* Ek dosya henüz çalıştırılmadıysa (konum sütunları yoksa) gizli kalır. */}
      {"latitude" in business && <BusinessLocation />}

      <BlockedCustomers businessId={business.id} />
    </div>
  );
}

function ImageButton({ label, busy, multiple, onPick }: { label: string; busy: boolean; multiple?: boolean; onPick: (f: FileList | null) => void }) {
  return (
    <label className={`btn btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
