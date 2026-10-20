"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  Compass,
  Heart,
  History,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  RotateCcw,
  Star,
  Store,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import { errorMessage, formatDate, formatPrice, formatTime, untilText } from "@/lib/format";
import type { Appointment, Business, Profile } from "@/lib/types";

type Row = Appointment & { businesses: { name: string; slug: string; phone: string; address: string; district: string; city: string } | null };
type Favorite = Pick<Business, "slug" | "name" | "district" | "city" | "logo_url" | "category">;
type Tab = "yaklasan" | "gecmis" | "favoriler" | "profil";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "yaklasan", label: "Yaklaşan", icon: CalendarCheck },
  { id: "gecmis", label: "Geçmiş", icon: History },
  { id: "favoriler", label: "Favoriler", icon: Heart },
  { id: "profil", label: "Profil", icon: UserRound },
];

/** "Tekrar al": işletme sayfası önceki hizmet ve personel seçili açılır. */
function rebookHref(slug: string, row: Row) {
  const q = new URLSearchParams();
  if (row.service_id) q.set("hizmet", row.service_id);
  if (row.staff_id) q.set("personel", row.staff_id);
  return `/${slug}${q.size ? `?${q}` : ""}#randevu`;
}

function mapsHref(b: NonNullable<Row["businesses"]>) {
  const place = [b.address, b.district, b.city].filter(Boolean).join(", ");
  return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${place}`)}` : null;
}

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<main className="mx-auto h-96 w-full max-w-4xl animate-pulse px-4 py-8" />}>
        <AccountView />
      </Suspense>
      <SiteFooter />
    </>
  );
}

function AccountView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("sekme"))?.id ?? "yaklasan") as Tab;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [lists, setLists] = useState<{ upcoming: Row[]; past: Row[] } | null>(null);
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  // Değerlendirilebilecek randevular: tamamlanan veya saati geçmiş onaylı, henüz değerlendirilmemiş.
  const [reviewable, setReviewable] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [moving, setMoving] = useState<Row | null>(null);

  const load = useCallback(async () => {
    // İstemci burada oluşturulur: build sırasında (env yokken) sayfa çizilirken değil.
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return router.replace("/giris?next=/hesabim");
    setEmail(auth.user.email ?? "");
    const [p, a, r, f] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
      supabase
        .from("appointments")
        .select("*, businesses(name, slug, phone, address, district, city)")
        .eq("customer_id", auth.user.id)
        .order("starts_at", { ascending: false })
        .limit(100),
      supabase.from("reviews").select("appointment_id").eq("customer_id", auth.user.id),
      supabase
        .from("favorites")
        .select("businesses(slug, name, district, city, logo_url, category)")
        .eq("customer_id", auth.user.id)
        .order("created_at", { ascending: false }),
    ]);
    setProfile(p.data as Profile | null);
    // Yayından kalkan işletme gelmez (businesses boş).
    setFavorites(((f.data ?? []) as unknown as { businesses: Favorite | null }[]).flatMap((x) => (x.businesses ? [x.businesses] : [])));
    const reviewed = new Set((r.data ?? []).map((x: { appointment_id: string }) => x.appointment_id));
    const rows = (a.data ?? []) as Row[];
    const now = new Date().toISOString();
    setReviewable(
      new Set(
        rows
          .filter((x) => !reviewed.has(x.id) && (x.status === "completed" || (x.status === "confirmed" && x.ends_at <= now)))
          .map((x) => x.id),
      ),
    );
    const isUpcoming = (r: Row) => r.starts_at >= now && ["pending", "confirmed"].includes(r.status);
    setLists({ upcoming: rows.filter(isUpcoming).reverse(), past: rows.filter((r) => !isUpcoming(r)) });
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veriyi ilk açılışta yükle
    load();
  }, [load]);

  function select(t: Tab) {
    router.replace(t === "yaklasan" ? pathname : `${pathname}?sekme=${t}`, { scroll: false });
  }

  async function cancel(id: string) {
    if (!confirm("Randevuyu iptal etmek istediğinize emin misiniz?")) return;
    const { error } = await createClient().rpc("cancel_appointment", { p_id: id });
    if (error) return setError(errorMessage(error));
    load();
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const upcoming = lists?.upcoming ?? [];
  const past = lists?.past ?? [];
  const next = upcoming[0];
  const done = past.filter((r) => r.status === "completed").length;
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const counts: Record<Tab, number | null> = { yaklasan: upcoming.length, gecmis: past.length, favoriler: favorites?.length ?? 0, profil: null };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-4">
      {/* Karşılama: kim olduğu, kısa özet ve en sık iş (randevu al) */}
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-brand-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-300 to-brand-600 text-xl font-bold text-brand-950">
            {(firstName || email).charAt(0).toLocaleUpperCase("tr") || "?"}
          </span>
          <div className="min-w-[10rem] flex-1">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Merhaba{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-ink-3">Randevuların, favorilerin ve hesabın burada.</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {profile?.role === "business" && (
              <Link href="/panel" className="btn btn-secondary">
                <Store className="size-4" /> İşletme Paneli
              </Link>
            )}
            <Link href="/kesfet" className="btn btn-primary">
              <Compass className="size-4" /> Randevu al
            </Link>
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-3 gap-2 border-t border-line pt-5 text-center">
          {[
            ["Yaklaşan", upcoming.length],
            ["Tamamlanan", done],
            ["Favori", favorites?.length ?? 0],
          ].map(([label, n]) => (
            <div key={label}>
              <dd className="text-2xl font-semibold tabular-nums">{lists ? n : "–"}</dd>
              <dt className="text-xs text-ink-3">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* Sıradaki randevu her sekmede üstte: kullanıcı en önemli bilgiyi aramaz. */}
      {next && next.businesses && (
        <section className="mt-4 flex flex-wrap items-center gap-4 rounded-3xl bg-brand-500 p-5 text-brand-950 shadow-[0_18px_40px_-18px_rgb(13_148_136/0.7)]">
          <div className="grid w-20 shrink-0 place-items-center rounded-2xl bg-white/25 py-2.5">
            <span className="text-2xs font-semibold uppercase tracking-wider">{untilText(next.starts_at)}</span>
            <span className="text-xl font-bold tabular-nums">{formatTime(next.starts_at)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Sıradaki randevun</p>
            <Link href={`/${next.businesses.slug}`} className="block truncate text-lg font-bold hover:underline">
              {next.businesses.name}
            </Link>
            <p className="truncate text-sm opacity-80">
              {formatDate(next.starts_at)} · {next.service_name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mapsHref(next.businesses) && (
              <a href={mapsHref(next.businesses)!} target="_blank" rel="noreferrer" className="btn bg-white/90 py-2 text-brand-950 hover:bg-white">
                <MapPin className="size-4" /> Yol tarifi
              </a>
            )}
            {next.businesses.phone && (
              <a href={`tel:${next.businesses.phone}`} className="btn bg-brand-950/10 py-2 text-brand-950 hover:bg-brand-950/20">
                <Phone className="size-4" /> Ara
              </a>
            )}
          </div>
        </section>
      )}

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>}

      <nav aria-label="Hesap bölümleri" className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1.5 ring-1 [scrollbar-width:none] ring-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => select(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-300 ${
              tab === t.id ? "bg-brand-400/12 text-accent" : "text-ink-3 hover:bg-tint/[0.04] hover:text-ink"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
            {counts[t.id] !== null && lists && (
              <span className={`rounded-full px-1.5 text-2xs tabular-nums ${tab === t.id ? "bg-brand-400/20" : "bg-tint/[0.06]"}`}>{counts[t.id]}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "yaklasan" &&
          (lists === null ? (
            <ListSkeleton />
          ) : upcoming.length === 0 ? (
            <Empty
              icon={CalendarX2}
              title="Yaklaşan randevun yok"
              text="Bugün müsait işletmelere göz at, birkaç dokunuşla saatini ayır."
              action={{ href: "/kesfet?bugun=1", label: "Bugün müsait olanlar" }}
            />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((r) => (
                <AppointmentCard key={r.id} row={r} onCancel={() => cancel(r.id)} onReschedule={r.service_id ? () => setMoving(r) : undefined} />
              ))}
            </ul>
          ))}

        {tab === "gecmis" &&
          (lists === null ? (
            <ListSkeleton />
          ) : past.length === 0 ? (
            <Empty icon={History} title="Henüz geçmiş randevun yok" text="Tamamladığın randevular burada görünür; tek dokunuşla tekrar alabilirsin." action={{ href: "/kesfet", label: "İşletmeleri keşfet" }} />
          ) : (
            <ul className="space-y-3">
              {past.map((r) => (
                <AppointmentCard key={r.id} row={r} canReview={reviewable.has(r.id)} onReviewed={load} />
              ))}
            </ul>
          ))}

        {tab === "favoriler" &&
          (favorites === null ? (
            <ListSkeleton />
          ) : favorites.length === 0 ? (
            <Empty icon={Heart} title="Favorin yok" text="Beğendiğin işletmenin sayfasındaki kalbe dokun; buradan hemen ulaşırsın." action={{ href: "/kesfet", label: "İşletmeleri keşfet" }} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {favorites.map((b) => (
                <li key={b.slug}>
                  <Link href={`/${b.slug}`} className="card group flex items-center gap-3 p-4 transition hover:-translate-y-0.5">
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-300 to-brand-600 font-bold text-brand-950">
                      {b.logo_url ? <img src={b.logo_url} alt="" className="size-full object-cover" /> : b.name.charAt(0).toLocaleUpperCase("tr")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.name}</span>
                      <span className="block truncate text-sm text-ink-3">{[b.district, b.city].filter(Boolean).join(", ")}</span>
                    </span>
                    <Heart className="size-4 shrink-0 fill-rose-500 text-rose-500" />
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {tab === "profil" && profile && <ProfilePanel profile={profile} email={email} onSaved={load} onLogout={logout} />}
        {tab === "profil" && !profile && <ListSkeleton />}
      </div>

      {moving && (
        <RescheduleDialog
          appointment={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            load();
          }}
        />
      )}
    </main>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-20 animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action: { href: string; label: string } }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-400/12 text-accent">
        <Icon className="size-6" />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-3">{text}</p>
      <Link href={action.href} className="btn btn-primary mt-5">
        {action.label}
      </Link>
    </div>
  );
}

function AppointmentCard({
  row,
  onCancel,
  onReschedule,
  canReview,
  onReviewed,
}: {
  row: Row;
  onCancel?: () => void;
  onReschedule?: () => void;
  canReview?: boolean;
  onReviewed?: () => void;
}) {
  const status = STATUS[row.status];
  const [reviewing, setReviewing] = useState(false);
  const day = formatDate(row.starts_at, { weekday: undefined, month: "short" });
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-brand-400/10 py-2 text-accent">
          <span className="text-2xs font-medium uppercase">{day}</span>
          <span className="text-lg font-bold tabular-nums">{formatTime(row.starts_at)}</span>
        </div>
        <div className="min-w-0 flex-1">
          {row.businesses ? (
            <Link href={`/${row.businesses.slug}`} className="font-semibold hover:underline">
              {row.businesses.name}
            </Link>
          ) : (
            <p className="font-semibold">İşletme</p>
          )}
          <p className="text-sm text-ink-2">
            {formatDate(row.starts_at)} · {row.service_name} · {formatPrice(row.price)}
          </p>
        </div>
        <span className={`chip ${status.className}`}>{status.label}</span>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {onReschedule && (
            <button onClick={onReschedule} className="btn btn-secondary py-2">
              <CalendarClock className="size-4" /> Saati değiştir
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className="btn btn-ghost py-2 text-bad">
              İptal et
            </button>
          )}
          {!onCancel && row.businesses && (
            <Link href={rebookHref(row.businesses.slug, row)} className="btn btn-secondary py-2">
              <RotateCcw className="size-4" /> Tekrar al
            </Link>
          )}
          {canReview && !reviewing && (
            <button onClick={() => setReviewing(true)} className="btn btn-primary py-2">
              <Star className="size-4" /> Değerlendir
            </button>
          )}
        </div>
      </div>
      {reviewing && (
        <ReviewForm
          appointmentId={row.id}
          onDone={() => {
            setReviewing(false);
            onReviewed?.();
          }}
        />
      )}
    </li>
  );
}

function ReviewForm({ appointmentId, onDone }: { appointmentId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Lütfen puan verin.");
    setBusy(true);
    const { error } = await createClient().rpc("add_review", { p_appointment_id: appointmentId, p_rating: rating, p_comment: comment });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="flex gap-1" role="radiogroup" aria-label="Puan">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} yıldız`} onClick={() => setRating(i)}>
            <Star className={`size-7 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
          </button>
        ))}
      </div>
      <textarea rows={2} maxLength={1000} className="input" placeholder="Deneyiminizi kısaca anlatın (isteğe bağlı)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button disabled={busy} className="btn btn-primary">
        {busy && <Loader2 className="size-4 animate-spin" />} Gönder
      </button>
    </form>
  );
}

function ProfilePanel({ profile, email, onSaved, onLogout }: { profile: Profile; email: string; onSaved: () => void; onLogout: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: profile.full_name, phone: profile.phone ?? "" });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.full_name.trim().length < 2) return setError("Lütfen adınızı girin.");
    setState("saving");
    const { error } = await createClient()
      .from("profiles")
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null })
      .eq("id", profile.id);
    if (error) {
      setState("idle");
      return setError(errorMessage(error));
    }
    setState("saved");
    onSaved();
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    const res = await fetch("/api/account/delete", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setDeleting(false);
      return setDeleteError(body.error ?? "Hesap silinemedi.");
    }
    await createClient().auth.signOut();
    router.replace("/?hesap=silindi");
    router.refresh();
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
      <form onSubmit={save} className="card space-y-4 p-6">
        <h2 className="font-semibold">Kişisel bilgiler</h2>
        <div>
          <label className="label" htmlFor="ad">
            Ad soyad
          </label>
          <input id="ad" className="input" maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="tel">
            Telefon
          </label>
          <input id="tel" type="tel" className="input" maxLength={30} placeholder="05xx xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <p className="mt-1.5 text-xs text-ink-3">Randevu formunda hazır doldurulur; işletme size bu numaradan ulaşır.</p>
        </div>
        <div>
          <p className="label">E-posta</p>
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2 ring-1 ring-line">{email}</p>
          <p className="mt-1.5 text-xs text-ink-3">Randevu bildirimleri bu adrese gider.</p>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex items-center gap-3">
          <button disabled={state === "saving"} className="btn btn-primary">
            {state === "saving" && <Loader2 className="size-4 animate-spin" />} Kaydet
          </button>
          {state === "saved" && <span className="text-sm text-ok">Kaydedildi</span>}
        </div>
      </form>

      <div className="space-y-4">
        <div className="card space-y-2 p-5 text-sm">
          <h2 className="font-semibold">Hesap</h2>
          <Link href="/sifremi-unuttum" className="block text-ink-2 hover:text-ink">
            Şifremi değiştir
          </Link>
          <CookieSettingsButton className="block text-ink-2 hover:text-ink" />
          <Link href="/yasal/gizlilik" className="block text-ink-2 hover:text-ink">
            Gizlilik ve KVKK
          </Link>
          <button type="button" onClick={onLogout} className="flex items-center gap-2 pt-2 text-ink-2 hover:text-ink">
            <LogOut className="size-4" /> Çıkış yap
          </button>
        </div>

        {profile.role === "customer" && (
          <div className="card p-5 text-sm ring-1 ring-rose-500/20">
            <h2 className="flex items-center gap-2 font-semibold text-bad">
              <Trash2 className="size-4" /> Hesabımı sil
            </h2>
            <p className="mt-2 leading-relaxed text-ink-3">
              Yaklaşan randevuların iptal edilir, favorilerin ve bildirimlerin silinir, yorumlarındaki adın kaldırılır. Bu işlem geri alınamaz.
            </p>
            <label className="label mt-3" htmlFor="sil">
              Onaylamak için <strong>SİL</strong> yazın
            </label>
            <input id="sil" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            {deleteError && <p className="mt-2 text-bad">{deleteError}</p>}
            <button type="button" disabled={confirmText.trim().toLocaleUpperCase("tr") !== "SİL" || deleting} onClick={deleteAccount} className="btn btn-danger mt-3 w-full">
              {deleting && <Loader2 className="size-4 animate-spin" />} Hesabımı kalıcı olarak sil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
