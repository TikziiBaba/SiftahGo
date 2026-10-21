"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CANCEL_REASONS } from "@/lib/constants";
import { errorMessage, formatDate, formatPrice, formatTime } from "@/lib/format";
import type { Appointment, CustomerCard } from "@/lib/types";

type Props = {
  appointment: Appointment & { staff: { name: string } | null };
  /** Pencere doğrudan ret/iptal adımında açılır (listedeki "Reddet"). */
  rejecting?: boolean;
  onClose: () => void;
  onDone: () => void;
};

const monthYear = (iso: string) => formatDate(iso, { weekday: undefined, day: undefined, year: "numeric" });

/**
 * Gelen randevuyu değerlendirme: müşterinin geçmişi ve yazdığı yorumlar (customer_card), onay ya da sebebiyle
 * ret/iptal. Sebep müşteriye e-posta ve bildirimle gider; istenirse müşteri engellenir.
 */
export function AppointmentReview({ appointment: a, rejecting: startRejecting = false, onClose, onDone }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [rejecting, setRejecting] = useState(startRejecting);
  const [reason, setReason] = useState("");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const pending = a.status === "pending";
  const active = pending || a.status === "confirmed";

  useEffect(() => {
    supabase.rpc("customer_card", { p_appointment_id: a.id }).then(({ data, error }) => {
      if (error) setError(errorMessage(error));
      else setCard(data as CustomerCard);
    });
  }, [supabase, a.id]);

  async function approve() {
    setBusy("approve");
    setError("");
    const { error } = await supabase.from("appointments").update({ status: "confirmed" }).eq("id", a.id);
    setBusy(null);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  async function reject(e: React.FormEvent) {
    e.preventDefault();
    setBusy("reject");
    setError("");
    let { error } = await supabase.from("appointments").update({ status: "cancelled", cancel_reason: reason.trim() }).eq("id", a.id);
    if (!error && block) ({ error } = await supabase.rpc("block_customer", { p_appointment_id: a.id }));
    setBusy(null);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  const history = card && card.here.completed + card.here.cancelled + card.here.no_show + (card.platform?.completed ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="review-title" className="text-lg font-bold">{a.customer_name}</h2>
            <p className="mt-0.5 text-sm text-ink-3">
              {formatDate(a.starts_at, { weekday: undefined })} {formatTime(a.starts_at)} · {a.service_name}
              {a.staff && ` · ${a.staff.name}`} · {formatPrice(a.price)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost px-2" aria-label="Kapat">
            <X className="size-5" />
          </button>
        </div>
        {a.note && <p className="mt-3 rounded-xl bg-tint/[0.03] p-3 text-sm italic text-ink-2 ring-1 ring-line">“{a.note}”</p>}

        {a.customer_flagged && (
          <p className="mt-3 flex gap-2 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
            Randevu alındığında son 6 ayda {a.prior_cancels} randevusunu iptal etmiş, {a.prior_no_shows} randevusuna gelmemişti.
          </p>
        )}

        {!card ? (
          !error && <div className="mt-4 h-40 animate-pulse rounded-2xl bg-surface-2" />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {card.member_since ? (
                <span className="chip bg-tint/5 text-ink-2 ring-1 ring-line">Üye: {monthYear(card.member_since)}</span>
              ) : (
                <span className="chip bg-tint/5 text-ink-3 ring-1 ring-line">Elle eklenen randevu (hesapsız)</span>
              )}
              {!history && <span className="chip bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20">İlk kez geliyor</span>}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Fact label="Sizde tamamlanan" value={card.here.completed} hint={card.here.last_visit ? `Son: ${formatDate(card.here.last_visit, { weekday: undefined })}` : undefined} />
              {card.platform && (
                <Fact label="SiftahGo'da tamamlanan" value={card.platform.completed} hint={`${card.platform.businesses} işletmede`} />
              )}
              <Fact label="Kendi iptali" value={card.platform?.cancelled ?? card.here.cancelled} bad={(card.platform?.cancelled ?? card.here.cancelled) >= 3} />
              <Fact label="Gelmediği" value={card.platform?.no_show ?? card.here.no_show} bad={(card.platform?.no_show ?? card.here.no_show) >= 2} />
            </div>

            {card.reviews && (
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  Yazdığı yorumlar
                  {card.reviews.count > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-3">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" /> {Number(card.reviews.avg).toFixed(1)} · {card.reviews.count} yorum
                    </span>
                  )}
                </p>
                {card.reviews.latest.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-3">Henüz yorum yazmamış.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line rounded-xl ring-1 ring-line">
                    {card.reviews.latest.map((r, i) => (
                      <li key={i} className="p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{r.business}</span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-ink-3">
                            <Star className="size-3.5 fill-amber-400 text-amber-400" /> {r.rating} · {formatDate(r.created_at, { weekday: undefined })}
                          </span>
                        </div>
                        {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-bad">{error}</p>}

        {active &&
          (rejecting ? (
            <form onSubmit={reject} className="mt-5 space-y-3 border-t border-line pt-4">
              <p className="text-sm font-semibold">{pending ? "Reddetme sebebi" : "İptal sebebi"}</p>
              <div className="flex flex-wrap gap-1.5">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${reason === r ? "bg-brand-400/15 text-accent-strong ring-brand-400/40" : "text-ink-2 ring-line hover:bg-tint/5"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                maxLength={300}
                className="input"
                placeholder="Müşteriye iletilecek açıklama (isteğe bağlı)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {a.customer_id && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand-400" checked={block} onChange={(e) => setBlock(e.target.checked)} />
                  <span>
                    Bu müşteriyi engelle
                    <span className="block text-xs text-ink-3">Online randevu alamaz, buradaki diğer yaklaşan randevuları da iptal olur.</span>
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => setRejecting(false)} className="btn btn-secondary flex-1">
                  Vazgeç
                </button>
                <button disabled={!!busy} className="btn flex-1 bg-rose-500/10 text-bad ring-1 ring-rose-400/20 hover:bg-rose-500/20">
                  {busy === "reject" && <Loader2 className="size-4 animate-spin" />} {pending ? "Reddet" : "İptal et"}
                </button>
              </div>
              <p className="text-xs text-ink-3">Müşteriye e-posta ve uygulama bildirimiyle haber verilir.</p>
            </form>
          ) : (
            <div className="mt-5 flex gap-2 border-t border-line pt-4">
              {pending && (
                <button type="button" disabled={!!busy} onClick={approve} className="btn btn-primary flex-1">
                  {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Onayla
                </button>
              )}
              <button type="button" disabled={!!busy} onClick={() => setRejecting(true)} className="btn btn-secondary flex-1 text-bad">
                <X className="size-4" /> {pending ? "Reddet" : "İptal et"}
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}

function Fact({ label, value, hint, bad }: { label: string; value: number; hint?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl bg-tint/[0.03] p-3 ring-1 ring-line">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${bad ? "text-bad" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
