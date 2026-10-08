"use client";

import { useContext, useState } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/site-header";
import { SetupDoneContext } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CITIES, RESERVED_SLUGS, SITE_DOMAIN } from "@/lib/constants";
import { errorMessage, slugInput, slugify } from "@/lib/format";

export default function SetupPage() {
  const done = useContext(SetupDoneContext);
  const [form, setForm] = useState({ name: "", slug: "", category: "berber", city: "", phone: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slug = slugTouched ? form.slug : slugify(form.name);
  const finalSlug = slugify(slug);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (finalSlug.length < 3 || RESERVED_SLUGS.includes(finalSlug)) {
      return setError("Lütfen en az 3 karakterlik farklı bir sayfa adresi seçin.");
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("businesses").insert({
      owner_id: auth.user!.id,
      name: form.name.trim(),
      slug: finalSlug,
      category: form.category,
      city: form.city,
      phone: form.phone.trim(),
    });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    await done();
  }

  return (
    <main className="grid flex-1 place-items-center relative overflow-hidden bg-[radial-gradient(ellipse_at_top,rgb(20_184_166/0.15),transparent_60%)] px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <form onSubmit={submit} className="card space-y-4 p-6 md:p-8">
          <div>
            <h1 className="text-xl font-bold">İşletmenizi oluşturalım</h1>
            <p className="mt-1 text-sm text-ink-3">Bu bilgileri daha sonra Ayarlar’dan değiştirebilirsiniz.</p>
          </div>
          <div>
            <label className="label" htmlFor="name">İşletme adı</label>
            <input id="name" required className="input" placeholder="Örn. Usta Berber" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="slug">Sayfa adresi</label>
            <div className="flex items-center overflow-hidden rounded-xl border border-line-strong bg-surface-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20">
              <span className="pl-3.5 text-sm text-ink-3">{SITE_DOMAIN}/</span>
              <input
                id="slug"
                required
                className="w-full bg-surface px-2 py-2.5 text-sm outline-none"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm({ ...form, slug: slugInput(e.target.value) });
                }}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">Kategori</label>
              <select id="category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="city">Şehir</label>
              <select id="city" required className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                <option value="">Seçin</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="phone">İşletme telefonu</label>
            <input id="phone" type="tel" className="input" placeholder="0212 xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button disabled={busy} className="btn btn-primary w-full py-3">
            {busy && <Loader2 className="size-4 animate-spin" />} İşletmeyi Oluştur
          </button>
        </form>
      </div>
    </main>
  );
}
