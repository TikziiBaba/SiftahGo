"use client";

import { useState } from "react";
import { Ban, CalendarClock, Loader2, PlayCircle, X } from "lucide-react";
import { dateTime, Empty, Section, TONE } from "@/components/admin/ui";
import { HoldButton } from "@/components/hold-button";
import { createClient } from "@/lib/supabase/client";
import { SUSPENSION_REASONS } from "@/lib/constants";
import { addDays, errorMessage, formatDate, todayStr, toIso } from "@/lib/format";
import type { Business, BusinessSuspension, FreezeRequest, SuspensionReason } from "@/lib/types";

const REASONS = Object.entries(SUSPENSION_REASONS) as [SuspensionReason, string][];
const DANGER = "bg-rose-500/10 text-bad ring-1 ring-rose-400/20 hover:bg-rose-500/20";

export const dayLabel = (day: string) => formatDate(day, { weekday: undefined, year: "numeric", month: "short" });

/** Askı işlemleri: sebep, süre ve randevu seçimiyle askıya alma, askıyı kaldırma, dondurma talebini uygulama ya da reddetme. */
export function SuspensionPanel({
  business: b,
  upcoming,
  current,
  request,
  onDone,
}: {
  business: Business;
  upcoming: number;
  current: BusinessSuspension | null;
  request: FreezeRequest | null;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState<{ reason: SuspensionReason | ""; note: string; until: string; cancel: boolean; requestId: string | null } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => PromiseLike<{ data?: unknown; error: { message?: string } | null }>, success: (data: unknown) => string) {
    setBusy(true);
    setMessage(null);
    const { data, error } = await fn();
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setMessage({ ok: true, text: success(data) });
    setForm(null);
    setRejecting(false);
    setRejectNote("");
    await onDone();
  }

  const supabase = createClient();
  const suspend = () =>
    run(
      () =>
        supabase.rpc("admin_suspend_business", {
          p_business_id: b.id,
          p_reason: form!.reason,
          p_note: form!.note,
          // Seçilen günün sonuna kadar.
          p_until: form!.until ? toIso(addDays(form!.until, 1), "00:00") : null,
          p_cancel_appointments: form!.cancel,
          p_request_id: form!.requestId,
        }),
      (n) => (Number(n) > 0 ? `İşletme askıya alındı, ${n} randevu iptal edildi.` : "İşletme askıya alındı."),
    );
  const lift = () =>
    run(() => supabase.rpc("admin_lift_suspension", { p_business_id: b.id }), () => "Askı kaldırıldı, geçen süre aboneliğe eklendi.");
  const reject = () =>
    run(() => supabase.rpc("admin_reject_freeze_request", { p_id: request!.id, p_note: rejectNote }), () => "Talep reddedildi.");

  return (
    <div className="space-y-3">
      {message && (
        <p className={`rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-500/10 text-bad"}`}>{message.text}</p>
      )}

      {request && !b.is_suspended && !form && (
        <div className="rounded-xl bg-sky-400/10 p-3 text-sm ring-1 ring-sky-400/20">
          <p className="flex items-center gap-1.5 font-medium">
            <CalendarClock className="size-4" /> Dondurma talebi: {dayLabel(request.starts_on)} – {dayLabel(request.ends_on)}
          </p>
          <p className="mt-1 text-ink-2">{request.reason}</p>
          <p className="mt-1 text-xs text-ink-3">Uygulayınca askı hemen başlar. İleri tarihli talebi başlangıç gününde uygulayın.</p>
          {rejecting ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                reject();
              }}
            >
              <label className="label text-xs" htmlFor="freeze-reject">Ret sebebi (işletme sahibi görür)</label>
              <textarea id="freeze-reject" required autoFocus minLength={3} maxLength={500} rows={2} className="input" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setRejecting(false)} className="btn btn-secondary flex-1">Vazgeç</button>
                <button disabled={busy} className={`btn flex-1 ${DANGER}`}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Reddet
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => setForm({ reason: "sahip_talebi", note: request.reason.slice(0, 500), until: request.ends_on, cancel: false, requestId: request.id })}
              >
                Uygula
              </button>
              <button type="button" onClick={() => setRejecting(true)} className="btn btn-secondary flex-1">
                <X className="size-4" /> Reddet
              </button>
            </div>
          )}
        </div>
      )}

      {b.is_suspended ? (
        <>
          {current && (
            <dl className="rounded-xl bg-rose-500/10 p-3 text-sm">
              <dt className="font-medium text-rose-200">{SUSPENSION_REASONS[current.reason]}</dt>
              {current.note && <dd className="mt-1 text-ink-2">{current.note}</dd>}
              <dd className="mt-1 text-xs text-ink-3">
                {dateTime(current.created_at)} başladı · {current.until ? `${dateTime(current.until)} kalkacak` : "Süresiz"}
              </dd>
            </dl>
          )}
          <HoldButton pending="Askı kaldırılıyor" disabled={busy} onConfirm={lift} className="btn btn-secondary w-full justify-start">
            <PlayCircle className="size-4 text-emerald-300" /> Askıyı kaldır (yayına aç)
          </HoldButton>
          <p className="text-xs text-ink-3">Askıda geçen süre aboneliğe eklenir. İptal edilmiş randevular geri gelmez.</p>
        </>
      ) : form ? (
        <div className="space-y-3 rounded-xl p-3 ring-1 ring-line">
          <label className="block">
            <span className="label text-xs">Sebep</span>
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as SuspensionReason })}>
              <option value="" disabled>Seçin</option>
              {REASONS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label text-xs">Not (işletme sahibi görür)</span>
            <textarea className="input" rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <label className="block">
            <span className="label text-xs">Şu güne kadar (boşsa süresiz)</span>
            <input className="input" type="date" min={todayStr()} value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
          </label>
          {upcoming > 0 && (
            <fieldset className="space-y-1.5 text-sm">
              <legend className="label text-xs">{upcoming} yaklaşan randevu</legend>
              <label className="flex items-center gap-2">
                <input type="radio" className="accent-brand-400" name="suspend-appointments" checked={!form.cancel} onChange={() => setForm({ ...form, cancel: false })} />
                Kalsın, hatırlatmalar sürsün
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" className="accent-brand-400" name="suspend-appointments" checked={form.cancel} onChange={() => setForm({ ...form, cancel: true })} />
                İptal et, müşteriye haber ver (geri alınamaz)
              </label>
            </fieldset>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setForm(null)} className="btn btn-secondary">Vazgeç</button>
            <HoldButton pending="Askıya alınıyor" disabled={busy || !form.reason} onConfirm={suspend} className={`btn flex-1 ${DANGER}`}>
              <Ban className="size-4" /> Askıya al
            </HoldButton>
          </div>
          <p className="text-xs text-ink-3">Onaylamak için basılı tutun. Askıyı sahibi kaldıramaz; kalkınca askıda geçen süre aboneliğe eklenir.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setForm({ reason: "", note: "", until: "", cancel: false, requestId: null })}
          className={`btn w-full justify-start ${DANGER}`}
        >
          <Ban className="size-4" /> Askıya al…
        </button>
      )}
    </div>
  );
}

/** İşletmenin geçmiş askıları: kim, ne zaman, neden, nasıl kalktı. */
export function SuspensionHistory({ rows, names }: { rows: BusinessSuspension[]; names: Map<string, string> }) {
  const who = (id: string | null) => (id ? names.get(id) || "Yönetici" : "Yönetici");
  return (
    <Section title="Askı geçmişi">
      {rows.length === 0 ? (
        <Empty>Bu işletme hiç askıya alınmadı.</Empty>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {rows.map((s) => (
            <li key={s.id} className="py-2.5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{SUSPENSION_REASONS[s.reason]}</span>
                {!s.lifted_at && <span className={`chip ${TONE.rose}`}>Sürüyor</span>}
                {s.appointments_cancelled > 0 && <span className={`chip ${TONE.amber}`}>{s.appointments_cancelled} randevu iptal</span>}
              </p>
              {s.note && <p className="mt-0.5 text-ink-2">{s.note}</p>}
              <p className="mt-0.5 text-xs text-ink-3">
                {dateTime(s.created_at)} · {who(s.created_by)}
                {s.lifted_at
                  ? ` → ${dateTime(s.lifted_at)} · ${s.lifted_by ? who(s.lifted_by) : "süre doldu"}`
                  : s.until
                    ? ` → ${dateTime(s.until)} kalkacak`
                    : " → süresiz"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
