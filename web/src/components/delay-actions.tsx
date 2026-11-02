"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { Appointment } from "@/lib/types";

const LATE_MINUTES = [5, 10, 15];
const DELAY_MINUTES = [10, 15, 30, 45];
const TWO_HOURS = 2 * 60 * 60 * 1000;

/** Rozet metni: müşterinin son haberi (işletme görür) ya da işletmenin son haberi (müşteri görür). Haber yoksa ve randevu bekleyen/onaylı değilse null. */
export function delayLabel(a: Pick<Appointment, "customer_late_minutes" | "business_delay_minutes" | "status">, side: "business" | "customer" = "business"): string | null {
  if (a.status !== "pending" && a.status !== "confirmed") return null;
  if (side === "business") return a.customer_late_minutes ? `${a.customer_late_minutes} dk gecikiyor` : null;
  return a.business_delay_minutes ? `Yaklaşık ${a.business_delay_minutes} dk gecikme` : null;
}

/** Şimdiki zaman; dakikada bir güncellenir, açık kalan kart pencereyi doğru gösterir. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Minutes({ options, busy, onPick }: { options: number[]; busy: boolean; onPick: (m: number) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {options.map((m) => (
        <button key={m} type="button" disabled={busy} onClick={() => onPick(m)} className="btn btn-secondary px-3 py-1.5 text-xs">
          {m} dk
        </button>
      ))}
      {busy && <Loader2 className="size-4 animate-spin" />}
    </span>
  );
}

/** Müşteri: randevudan 2 saat önce ile bitiş arası "geç kalacağım" der. */
export function CustomerLateButton({ appointment, onDone }: { appointment: Appointment; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const now = useNow(); // sunucu zaten pencereyi denetler
  const inWindow = now >= new Date(appointment.starts_at).getTime() - TWO_HOURS && now < new Date(appointment.ends_at).getTime();
  if (!inWindow || !["pending", "confirmed"].includes(appointment.status)) return null;

  async function send(minutes: number) {
    setBusy(true);
    setError("");
    const { error } = await createClient().rpc("report_customer_late", { p_id: appointment.id, p_minutes: minutes });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSent(minutes);
    setOpen(false);
    onDone?.();
  }

  return (
    <div className="w-full">
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">Ne kadar geç kalacaksın?</span>
          <Minutes options={LATE_MINUTES} busy={busy} onPick={send} />
          <button type="button" className="btn btn-ghost px-2 py-1.5 text-xs" onClick={() => setOpen(false)}>
            Vazgeç
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary py-2" onClick={() => setOpen(true)}>
          <Clock className="size-4" /> Gecikiyorum
        </button>
      )}
      {sent && !open && <p className="mt-2 text-sm text-ok">İşletmeye {sent} dk gecikeceğin haber verildi.</p>}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

/** İşletme: bir personelin önümüzdeki 3 saatteki müşterilerine "gecikmemiz var" der. */
export function BusinessDelayButton({ staff, named, onDone }: { staff: { id: string; name: string }; named?: boolean; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function send(minutes: number) {
    setBusy(true);
    setError("");
    const { data, error } = await createClient().rpc("report_business_delay", { p_staff_id: staff.id, p_minutes: minutes });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    const n = Number(data ?? 0);
    setResult(n > 0 ? `${n} müşteriye haber verildi` : "Haber verilebilecek müşteri yok. Elle eklenen randevuları arayın.");
    setOpen(false);
    onDone?.();
  }

  return (
    <div className="space-y-1.5">
      {open ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Minutes options={DELAY_MINUTES} busy={busy} onPick={send} />
          <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(false)}>
            Vazgeç
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => { setResult(""); setOpen(true); }} aria-label={`${staff.name} için gecikme haberi`}>
          <Clock className="size-3.5" /> {named ? `${staff.name}: Sarktık` : "Sarktık"}
        </button>
      )}
      {result && !open && (
        <p className="text-xs text-ok" role="status">
          {result}
        </p>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
