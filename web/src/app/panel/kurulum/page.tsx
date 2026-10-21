"use client";

import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Hourglass, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Logo } from "@/components/site-header";
import { SetupContext } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CITIES, REFERRAL_KEY, RESERVED_SLUGS, SITE_DOMAIN } from "@/lib/constants";
import { errorMessage, formatDate, slugInput, slugify } from "@/lib/format";
import type { Business } from "@/lib/types";

/** İşletme başvurusu: yeni başvuru, inceleniyor ekranı ya da reddedilen başvuruyu düzeltip yeniden gönderme. */
export default function SetupPage() {
  const { business, refresh } = useContext(SetupContext);
  return (
    <main className="grid flex-1 place-items-center relative overflow-hidden bg-[radial-gradient(ellipse_at_top,rgb(20_184_166/0.15),transparent_60%)] px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {business?.approval_status === "pending" ? (
          <Waiting business={business} refresh={refresh} />
        ) : (
          <ApplicationForm business={business} done={refresh} />
        )}
        <LogoutButton />
      </div>
    </main>
  );
}

function ApplicationForm({ business, done }: { business: Business | null; done: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: business?.name ?? "",
    slug: business?.slug ?? "",
    category: business?.category ?? "berber",
    city: business?.city ?? "",
    district: business?.district ?? "",
    address: business?.address ?? "",
    phone: business?.phone ?? "",
  });
  // Davet bağlantısıyla kayıt olunduysa kod hazır gelir.
  const [referral, setReferral] = useState(() => {
    try {
      return localStorage.getItem(REFERRAL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [slugTouched, setSlugTouched] = useState(!!business);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slug = slugTouched ? form.slug : slugify(form.name);
  const finalSlug = slugify(slug);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (finalSlug.length < 3 || RESERVED_SLUGS.includes(finalSlug)) {
      return setError("Lütfen en az 3 karakterlik farklı bir sayfa adresi seçin.");
    }
    if (![form.district, form.address, form.phone].every((v) => v.trim())) {
      return setError("İlçe, açık adres ve telefon zorunlu.");
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const fields = {
      name: form.name.trim(),
      slug: finalSlug,
      category: form.category,
      city: form.city,
      district: form.district.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
    };
    if (business) {
      // Reddedilen başvuru düzeltilip yeniden incelemeye gönderilir.
      const { error } = await supabase.from("businesses").update({ ...fields, approval_status: "pending" }).eq("id", business.id);
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    } else {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("businesses").insert({ owner_id: auth.user!.id, ...fields });
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
      // Kod geçersizse kurulum yine biter; kod sonra Abonelik sayfasından girilebilir.
      if (referral.trim()) await supabase.rpc("apply_referral", { p_code: referral });
      try {
        localStorage.removeItem(REFERRAL_KEY);
      } catch {}
    }
    await done();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{business ? "Başvurunuzu düzeltin" : "İşletmenizi oluşturalım"}</h1>
        <p className="mt-1 text-sm text-ink-3">
          Bilgileriniz yetkililerimizce kontrol edildikten sonra sayfanız yayına açılır ve 7 günlük ücretsiz Pro denemeniz başlar.
        </p>
      </div>
      {business?.approval_status === "rejected" && (
        <div className="flex gap-3 rounded-xl bg-rose-500/10 p-3 text-sm ring-1 ring-rose-400/20">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" />
          <div>
            <p className="font-medium text-rose-200">Başvurunuz onaylanmadı</p>
            {business.approval_note && <p className="mt-0.5 text-rose-200/90">{business.approval_note}</p>}
            <p className="mt-1 text-xs text-ink-3">Bilgileri düzeltip yeniden gönderin.</p>
          </div>
        </div>
      )}
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
        <label className="label" htmlFor="district">İlçe</label>
        <input id="district" required className="input" placeholder="Örn. Kadıköy" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="address">Açık adres</label>
        <textarea id="address" required rows={2} maxLength={300} className="input" placeholder="Mahalle, cadde/sokak, bina ve kapı no" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="phone">İşletme telefonu</label>
        <input id="phone" type="tel" required className="input" placeholder="0212 xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <p className="mt-1 text-xs text-ink-3">Başvurunuzu doğrulamak için bu numaradan size ulaşabiliriz.</p>
      </div>
      {!business && (
        <div>
          <label className="label" htmlFor="referral">Davet kodu (isteğe bağlı)</label>
          <input
            id="referral"
            className="input uppercase tracking-widest"
            maxLength={8}
            placeholder="Sizi davet eden işletmenin kodu"
            value={referral}
            onChange={(e) => setReferral(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-3">İlk ödemenizde hem size hem davet edene 1 ay hediye.</p>
        </div>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} {business ? "Yeniden gönder" : "Başvuruyu gönder"}
      </button>
    </form>
  );
}

function Waiting({ business: b, refresh }: { business: Business; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const rows = [
    ["İşletme", b.name],
    ["Sayfa adresi", `${SITE_DOMAIN}/${b.slug}`],
    ["Adres", [b.address, b.district, b.city].filter(Boolean).join(", ")],
    ["Telefon", b.phone],
    ["Başvuru", formatDate(b.submitted_at, { weekday: undefined, year: "numeric", hour: "2-digit", minute: "2-digit" })],
  ];

  return (
    <div className="card p-6 text-center md:p-8">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-400/10 text-amber-300">
        <Hourglass className="size-5" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Başvurunuz inceleniyor</h1>
      <p className="mt-2 text-sm text-ink-3">
        Yetkililerimiz bilgilerinizi kontrol ediyor; gerekirse sizi işletme telefonunuzdan arayabiliriz. Onaylanınca sayfanız
        yayına açılır ve 7 günlük ücretsiz Pro denemeniz başlar.
      </p>
      <dl className="mt-6 divide-y divide-line rounded-2xl bg-tint/[0.03] px-4 text-left text-sm ring-1 ring-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-ink-3">{label}</dt>
            <dd className="min-w-0 text-right">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refresh();
          setBusy(false);
        }}
        className="btn btn-secondary mt-6 w-full"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Durumu yenile
      </button>
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/esnaf");
      }}
      className="btn btn-ghost mx-auto mt-4 flex"
    >
      <LogOut className="size-4" /> Çıkış
    </button>
  );
}
