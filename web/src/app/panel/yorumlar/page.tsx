"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareText, Star } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatDate } from "@/lib/format";
import type { Review } from "@/lib/types";

type Row = Review & { appointments: { service_name: string } | null };

export default function ReviewsPage() {
  const { business } = useBusiness();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("reviews")
      .select("*, appointments(service_name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setError(errorMessage(error));
    setRows((data ?? []) as Row[]);
  }, [business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yorumları ilk açılışta yükle
    load();
  }, [load]);

  const all = rows ?? [];
  const open = all.filter((r) => !r.reply).length;
  const list = onlyOpen ? all.filter((r) => !r.reply) : all;
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: all.filter((r) => r.rating === n).length }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold">Yorumlar</h1>
      <p className="text-sm text-ink-3">
        Sadece randevusu gerçekleşen müşteriler puan verebilir. Cevabınız işletme sayfanızda yorumun altında herkese görünür.
      </p>

      <div className="card mt-5 grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="text-center sm:pr-6">
          <p className="text-4xl font-bold">{business.rating_count > 0 ? Number(business.rating_avg).toFixed(1) : "—"}</p>
          <Stars value={Math.round(Number(business.rating_avg))} className="mt-1 justify-center" />
          <p className="mt-1 text-xs text-ink-3">{business.rating_count} değerlendirme</p>
        </div>
        <ul className="space-y-1.5">
          {counts.map(({ n, c }) => (
            <li key={n} className="flex items-center gap-3 text-sm">
              <span className="w-3 text-ink-3">{n}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: all.length ? `${(c / all.length) * 100}%` : 0 }} />
              </span>
              <span className="w-6 text-right tabular-nums text-ink-3">{c}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {all.length > 0 && (
        <div className="mt-6 flex gap-2">
          {[
            [false, `Tümü (${all.length})`],
            [true, `Cevap bekleyen (${open})`],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              onClick={() => setOnlyOpen(value as boolean)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                onlyOpen === value ? "border-brand-400 bg-brand-700 text-white" : "border-line-strong hover:bg-white/5"
              }`}
            >
              {label as string}
            </button>
          ))}
        </div>
      )}

      <section className="mt-4">
        {rows === null ? (
          <div className="card h-32 animate-pulse bg-surface-2" />
        ) : list.length === 0 ? (
          <div className="card flex flex-col items-center p-10 text-center text-ink-3">
            <MessageSquareText className="size-10" />
            <p className="mt-2">
              {all.length === 0
                ? "Henüz değerlendirme yok. Randevudan sonra müşterilerinize puan vermeleri için otomatik hatırlatma gider."
                : "Cevap bekleyen yorum yok."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((r) => (
              <ReviewItem key={r.id} row={r} onSaved={load} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReviewItem({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [editing, setEditing] = useState(!row.reply);
  const [reply, setReply] = useState(row.reply);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(text: string) {
    setBusy(true);
    setError("");
    const { error } = await createClient().rpc("reply_review", { p_id: row.id, p_reply: text });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setReply(text.trim());
    setEditing(!text.trim());
    onSaved();
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{row.customer_name}</p>
          <p className="text-xs text-ink-3">
            {row.appointments?.service_name ? `${row.appointments.service_name} · ` : ""}
            {formatDate(row.created_at, { weekday: undefined, year: "numeric" })}
          </p>
        </div>
        <Stars value={row.rating} />
      </div>
      {row.comment ? <p className="mt-2 text-sm text-ink-2">{row.comment}</p> : <p className="mt-2 text-sm italic text-ink-3">Yorum yazılmadan puan verildi.</p>}

      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) save(reply);
          }}
        >
          <textarea
            rows={2}
            maxLength={1000}
            className="input"
            placeholder="Teşekkür edin veya yaşanan sorunu açıklayın. Cevabınız herkese açık."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy || !reply.trim()} className="btn btn-primary py-2">
              {busy && <Loader2 className="size-4 animate-spin" />} Cevapla
            </button>
            {row.reply && (
              <button type="button" className="btn btn-ghost py-2" onClick={() => { setReply(row.reply); setEditing(false); }}>
                Vazgeç
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-3 rounded-lg border-l-2 border-brand-400/40 bg-white/[0.03] px-3 py-2 text-sm">
          <p className="text-xs font-medium text-brand-300">Cevabınız</p>
          <p className="mt-0.5 text-ink-2">{reply}</p>
          {error && <p className="mt-1 text-rose-400">{error}</p>}
          <div className="mt-1 flex gap-3 text-xs">
            <button className="text-brand-300 hover:underline" onClick={() => setEditing(true)}>Düzenle</button>
            <button disabled={busy} className="text-rose-400 hover:underline" onClick={() => save("")}>Kaldır</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`flex gap-0.5 ${className}`} aria-label={`${value} yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-4 ${i <= value ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
      ))}
    </span>
  );
}
