"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Link2, Loader2, Lock, Megaphone, Palette, type LucideIcon } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { ACCENTS, isSubscribed } from "@/lib/constants";
import { errorMessage } from "@/lib/format";

/** "@ad", "instagram.com/ad/" gibi girişlerden yalnızca kullanıcı adını alır. */
function instagramName(v: string) {
  return v.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
}

function websiteUrl(v: string) {
  const t = v.trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
}

/** Dükkân sayfasının pakete göre açılan özelleştirmeleri: duyuru, kısayollar, sayfa rengi. */
export function PageAppearance() {
  const { business, refresh } = useBusiness();
  const [features, setFeatures] = useState<{ planId: string | null; list: string[] } | null>(null);
  const [form, setForm] = useState({
    announcement: business.announcement ?? "",
    whatsapp: business.whatsapp ?? "",
    instagram: business.instagram ?? "",
    website: business.website ?? "",
    accent: business.accent ?? "turkuaz",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .from("plans")
      .select("features")
      .eq("id", business.plan_id ?? "")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setFeatures({ planId: business.plan_id, list: (data?.features as string[] | undefined) ?? [] });
      });
    return () => {
      active = false;
    };
  }, [business.plan_id]);

  const loaded = features?.planId === business.plan_id;
  const has = (f: string) => loaded && isSubscribed(business) && features.list.includes(f);
  const anyOpen = has("announcement") || has("links") || has("theme");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const patch = { ...form, announcement: form.announcement.trim(), instagram: instagramName(form.instagram), website: websiteUrl(form.website) };
    setBusy(true);
    const { error } = await createClient().from("businesses").update(patch).eq("id", business.id);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setForm(patch);
    setMessage({ ok: true, text: "Sayfa görünümü kaydedildi." });
    refresh();
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Sayfa görünümü</h2>
          <p className="mt-1 text-sm text-ink-3">Paketiniz yükseldikçe sayfanızı daha çok kişiselleştirebilirsiniz.</p>
        </div>
        <Link href={`/${business.slug}`} target="_blank" className="btn btn-ghost py-2 text-sm">
          <ExternalLink className="size-4" /> Sayfamı gör
        </Link>
      </div>

      <form onSubmit={save} className="card mt-4 divide-y divide-line">
        <Part icon={Megaphone} title="Duyuru bandı" plan="Esnaf" locked={!has("announcement")}
          text="Sayfanızın üstünde öne çıkar: tatil günleri, kampanyalar, yeni hizmetler.">
          <textarea
            rows={2}
            maxLength={160}
            className="input"
            value={form.announcement}
            onChange={(e) => setForm({ ...form, announcement: e.target.value })}
            placeholder="Örn. Bayramda da açığız! Salı günleri saç kesiminde %20 indirim."
            aria-label="Duyuru"
          />
          <p className="mt-1 text-right text-xs text-ink-3">{form.announcement.length}/160 · Boş bırakırsanız görünmez.</p>
        </Part>

        <Part icon={Link2} title="Kısayollar" plan="Esnaf" locked={!has("links")}
          text="Müşteriniz tek dokunuşla WhatsApp'tan yazsın, Instagram hesabınıza ve sitenize gitsin. Boş bıraktıklarınız görünmez.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="pa-whatsapp">WhatsApp numarası</label>
              <input id="pa-whatsapp" type="tel" maxLength={20} className="input" value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/[^0-9+ ()-]/g, "") })} placeholder="05xx xxx xx xx" />
              {business.phone && form.whatsapp !== business.phone && (
                <button type="button" className="mt-1 text-xs text-brand-300 hover:underline" onClick={() => setForm({ ...form, whatsapp: business.phone })}>
                  Telefon numaramı kullan
                </button>
              )}
            </div>
            <div>
              <label className="label" htmlFor="pa-instagram">Instagram kullanıcı adı</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-3">@</span>
                <input id="pa-instagram" maxLength={60} className="input pl-7" value={form.instagram}
                  onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="isletmeniz" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pa-website">Web sitesi</label>
              <input id="pa-website" type="url" maxLength={200} className="input" value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
            </div>
          </div>
        </Part>

        <Part icon={Palette} title="Sayfa rengi" plan="Pro" locked={!has("theme")}
          text="Kapak, düğmeler ve vurgular bu renge bürünür. Renkler koyu temada okunaklı olacak şekilde seçildi.">
          <div role="radiogroup" aria-label="Sayfa rengi" className="flex flex-wrap gap-3">
            {ACCENTS.map((a) => {
              const on = form.accent === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setForm({ ...form, accent: a.id })}
                  className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm ring-1 transition ${on ? "bg-white/[0.06] text-ink ring-line-strong" : "text-ink-2 ring-line hover:bg-white/[0.04]"}`}
                >
                  <span className="grid size-6 place-items-center rounded-full" style={{ backgroundColor: a.scale[4] }}>
                    {on && <Check className="size-3.5" style={{ color: a.scale[10] }} />}
                  </span>
                  {a.label}
                </button>
              );
            })}
          </div>
        </Part>

        <div className="flex flex-wrap items-center gap-3 p-5">
          <button disabled={busy || !anyOpen} className="btn btn-primary px-6">
            {busy && <Loader2 className="size-4 animate-spin" />} Görünümü kaydet
          </button>
          {message && <p className={`text-sm ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>{message.text}</p>}
        </div>
      </form>
    </section>
  );
}

function Part({ icon: Icon, title, text, plan, locked, children }: {
  icon: LucideIcon;
  title: string;
  text: string;
  plan: string;
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {locked && (
              <Link href="/panel/abonelik" className="chip gap-1 bg-gold/10 text-gold hover:bg-gold/15">
                <Lock className="size-3" /> {plan} paketinde
              </Link>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-3">{text}</p>
        </div>
      </div>
      {/* Kilitliyken alanlar görünür ama düzenlenemez; ne kazanacağını görsün. */}
      <fieldset disabled={locked} className={`mt-4 ${locked ? "pointer-events-none opacity-45" : ""}`}>
        {children}
      </fieldset>
    </div>
  );
}
