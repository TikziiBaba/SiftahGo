import { formatDate, formatDuration, formatPrice, formatTime } from "@/lib/format";

/**
 * Alınan randevu, delikli koçanlı bir bilet olarak (bkz. .ticket-top / .ticket-stub, globals.css).
 * Renkler sayfa rengini (brand-*) izler; dükkân sayfasında işletmenin seçtiği renge bürünür.
 */
export function AppointmentTicket({
  businessName,
  serviceName,
  staffName,
  startsAt,
  durationMinutes,
  price,
  place,
  confirmed,
}: {
  businessName: string;
  serviceName: string;
  staffName?: string;
  startsAt: string;
  durationMinutes: number;
  price: number;
  place: string;
  confirmed: boolean;
}) {
  return (
    <div className="ticket-in mx-auto w-full max-w-sm drop-shadow-[0_18px_28px_rgb(15_26_25/0.16)]">
      <div className="ticket-top rounded-t-3xl bg-gradient-to-br from-brand-400 to-brand-600 px-6 pb-8 pt-6 text-brand-950">
        <div className="flex items-center justify-between gap-2">
          <span className="text-3xs font-semibold uppercase tracking-[0.2em] opacity-70">Randevunuz alındı</span>
          <span className="chip bg-white/30">{confirmed ? "Onaylandı" : "Onay bekliyor"}</span>
        </div>
        <h2 className="mt-6 text-2xl font-bold leading-tight tracking-tight">{businessName}</h2>
        <p className="mt-1 font-medium opacity-80">{serviceName}</p>
      </div>
      <div className="ticket-stub rounded-b-3xl bg-surface px-6 pb-6">
        <div aria-hidden className="mx-2 border-t-2 border-dashed border-line-strong" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-5 text-sm">
          <Field label="Saat">
            <span className="text-2xl font-bold tabular-nums">{formatTime(startsAt)}</span>
          </Field>
          <Field label="Tarih">{formatDate(startsAt)}</Field>
          <Field label="Süre">{formatDuration(durationMinutes)}</Field>
          <Field label="Ücret">{price > 0 ? formatPrice(price) : "—"}</Field>
          {staffName && <Field label="Personel">{staffName}</Field>}
          {place && (
            <div className="col-span-2">
              <Field label="Adres">{place}</Field>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-3xs font-semibold uppercase tracking-[0.15em] text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
