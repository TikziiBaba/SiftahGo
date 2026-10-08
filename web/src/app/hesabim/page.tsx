"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarX2, Loader2, LogOut, RotateCcw, Star, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import { errorMessage, formatDate, formatPrice, formatTime } from "@/lib/format";
import type { Appointment, Profile } from "@/lib/types";

type Row = Appointment & { businesses: { name: string; slug: string; phone: string } | null };

export default function AccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lists, setLists] = useState<{ upcoming: Row[]; past: Row[] } | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return router.replace("/giris?next=/hesabim");
    const [p, a, r] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
      supabase
        .from("appointments")
        .select("*, businesses(name, slug, phone)")
        .eq("customer_id", auth.user.id)
        .order("starts_at", { ascending: false })
        .limit(100),
      supabase.from("reviews").select("appointment_id").eq("customer_id", auth.user.id),
    ]);
    setProfile(p.data as Profile | null);
    setReviewed(new Set((r.data ?? []).map((x: { appointment_id: string }) => x.appointment_id)));
    const rows = (a.data ?? []) as Row[];
    const now = new Date().toISOString();
    const isUpcoming = (r: Row) => r.starts_at >= now && ["pending", "confirmed"].includes(r.status);
    setLists({ upcoming: rows.filter(isUpcoming).reverse(), past: rows.filter((r) => !isUpcoming(r)) });
  }, [supabase, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veriyi ilk açılışta yükle
    load();
  }, [load]);

  async function cancel(id: string) {
    if (!confirm("Randevuyu iptal etmek istediğinize emin misiniz?")) return;
    const { error } = await supabase.rpc("cancel_appointment", { p_id: id });
    if (error) return setError(errorMessage(error));
    load();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const upcoming = lists?.upcoming ?? [];
  const past = lists?.past ?? [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Merhaba{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
            <p className="text-stone-500">Randevularınızı buradan takip edebilirsiniz.</p>
          </div>
          <div className="flex gap-2">
            {profile?.role === "business" && (
              <Link href="/panel" className="btn btn-secondary"><Store className="size-4" /> İşletme Paneli</Link>
            )}
            <button onClick={logout} className="btn btn-ghost"><LogOut className="size-4" /> Çıkış</button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <h2 className="mt-8 font-semibold">Yaklaşan randevular</h2>
        {lists === null ? (
          <div className="card mt-3 h-24 animate-pulse bg-stone-100" />
        ) : upcoming.length === 0 ? (
          <div className="card mt-3 flex flex-col items-center p-8 text-center">
            <CalendarX2 className="size-10 text-stone-300" />
            <p className="mt-2 text-stone-600">Yaklaşan randevunuz yok.</p>
            <Link href="/kesfet" className="btn btn-primary mt-4">Randevu Al</Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((r) => (
              <AppointmentCard key={r.id} row={r} onCancel={() => cancel(r.id)} />
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mt-10 font-semibold">Geçmiş</h2>
            <ul className="mt-3 space-y-3">
              {past.map((r) => (
                <AppointmentCard key={r.id} row={r} canReview={r.status === "completed" && !reviewed.has(r.id)} onReviewed={load} />
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

function AppointmentCard({
  row,
  onCancel,
  canReview,
  onReviewed,
}: {
  row: Row;
  onCancel?: () => void;
  canReview?: boolean;
  onReviewed?: () => void;
}) {
  const status = STATUS[row.status];
  const [reviewing, setReviewing] = useState(false);
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid w-16 place-items-center rounded-xl bg-brand-50 py-2 text-brand-800">
          <span className="text-lg font-bold">{formatTime(row.starts_at)}</span>
        </div>
        <div className="min-w-0 flex-1">
          {row.businesses ? (
            <Link href={`/${row.businesses.slug}`} className="font-semibold hover:underline">{row.businesses.name}</Link>
          ) : (
            <p className="font-semibold">İşletme</p>
          )}
          <p className="text-sm text-stone-600">
            {formatDate(row.starts_at)} · {row.service_name} · {formatPrice(row.price)}
          </p>
        </div>
        <span className={`chip ${status.className}`}>{status.label}</span>
        {onCancel && (
          <button onClick={onCancel} className="btn btn-ghost text-rose-600">İptal et</button>
        )}
        {!onCancel && row.businesses && (
          <Link href={`/${row.businesses.slug}`} className="btn btn-ghost">
            <RotateCcw className="size-4" /> Tekrar al
          </Link>
        )}
        {canReview && !reviewing && (
          <button onClick={() => setReviewing(true)} className="btn btn-secondary">
            <Star className="size-4" /> Değerlendir
          </button>
        )}
      </div>
      {reviewing && <ReviewForm appointmentId={row.id} onDone={() => { setReviewing(false); onReviewed?.(); }} />}
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
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
      <div className="flex gap-1" role="radiogroup" aria-label="Puan">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} yıldız`} onClick={() => setRating(i)}>
            <Star className={`size-7 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-stone-300"}`} />
          </button>
        ))}
      </div>
      <textarea rows={2} maxLength={1000} className="input" placeholder="Deneyiminizi kısaca anlatın (isteğe bağlı)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn btn-primary">
        {busy && <Loader2 className="size-4 animate-spin" />} Gönder
      </button>
    </form>
  );
}
