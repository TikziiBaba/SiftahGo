"use client";

import { useState } from "react";
import { Loader2, LocateFixed, MapPin } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

/** İşletmenin konumu: Keşfet'te "Yakınımda" aramasında görünmek için; bu cihazın konumundan kaydedilir. */
export function BusinessLocation() {
  const { business, refresh } = useBusiness();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = business.latitude != null && business.longitude != null;

  async function save(latitude: number | null, longitude: number | null) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().from("businesses").update({ latitude, longitude }).eq("id", business.id);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: errorMessage(error) });
    setMessage({ ok: true, text: latitude == null ? "Konum kaldırıldı." : "Konum kaydedildi." });
    refresh();
  }

  function saveHere() {
    if (!navigator.geolocation) return setMessage({ ok: false, text: "Tarayıcınız konumu desteklemiyor." });
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (p) => save(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))),
      () => {
        setBusy(false);
        setMessage({ ok: false, text: "Konum alınamadı. Tarayıcıda konum iznini açıp tekrar deneyin." });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <section>
      <h2 className="text-xl font-bold">Konum</h2>
      <p className="mt-1 text-sm text-ink-3">
        Müşteriler Keşfet&apos;te &quot;Yakınımda&quot; ile yakındaki işletmeleri görür. İşletmenizdeyken bu cihazın konumunu kaydedin.
      </p>
      <div className="card mt-4 flex flex-wrap items-center gap-3 p-5">
        <MapPin className="size-5 shrink-0 text-brand-300" />
        <p className="min-w-0 flex-1 text-sm">
          {saved ? (
            <>
              Konum kayıtlı ·{" "}
              <a
                className="text-brand-300 underline"
                href={`https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Haritada gör
              </a>
            </>
          ) : (
            "Konum girilmedi; Yakınımda aramasında görünmezsiniz."
          )}
        </p>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={saveHere}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />} Bulunduğum yeri kaydet
        </button>
        {saved && (
          <button type="button" className="btn btn-ghost text-rose-400" disabled={busy} onClick={() => save(null, null)}>
            Kaldır
          </button>
        )}
      </div>
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-emerald-400" : "text-rose-400"}`}>{message.text}</p>}
    </section>
  );
}
