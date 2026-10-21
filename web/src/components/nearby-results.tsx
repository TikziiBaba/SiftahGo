"use client";

import { useState } from "react";
import { Loader2, LocateFixed, X } from "lucide-react";
import { BusinessCard, type BusinessCardData } from "@/components/business-card";
import { loadClient } from "@/lib/supabase/lazy";

type Nearby = BusinessCardData & { distance_km: number };

/**
 * Keşfet "Yakınımda": tarayıcının konumuyla 50 km içindeki işletmeleri uzaklığa göre gösterir (konum
 * sunucuda saklanmaz, adres çubuğuna yazılmaz). Kapalıyken sunucunun listesi (children) görünür.
 * `actions`: düğmenin yanında gösterilen ek bağlantılar (ana sayfa).
 */
export function NearbyResults({
  category,
  query,
  today,
  actions,
  children,
}: {
  category: string;
  query: string;
  today: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [list, setList] = useState<Nearby[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function locate() {
    if (!navigator.geolocation) return setError("Tarayıcınız konumu desteklemiyor.");
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const supabase = await loadClient();
        const { data, error } = await supabase.rpc("nearby_businesses", {
          p_lat: p.coords.latitude,
          p_lng: p.coords.longitude,
          p_category: category || null,
          p_query: query.replace(/[%_\\]/g, "") || null,
        });
        let rows = (data ?? []) as Nearby[];
        if (!error && today && rows.length) {
          const { data: open } = await supabase.rpc("available_today", { p_ids: rows.map((r) => r.id) });
          const ids = new Set((open ?? []) as string[]);
          rows = rows.filter((r) => ids.has(r.id));
        }
        setBusy(false);
        if (error) return setError("Yakındaki işletmeler alınamadı, lütfen tekrar deneyin.");
        setList(rows);
      },
      () => {
        setBusy(false);
        setError("Konum alınamadı. Tarayıcıda konum iznini açıp tekrar deneyin.");
      },
      { timeout: 15000, maximumAge: 300000 },
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {list === null ? (
          <button type="button" onClick={locate} disabled={busy} className="btn btn-secondary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4 text-accent" />} Yakınımda
          </button>
        ) : (
          <button type="button" onClick={() => setList(null)} className="btn btn-secondary">
            <X className="size-4" /> Yakınımda · tüm sonuçlara dön
          </button>
        )}
        {actions}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
      {list === null ? (
        children
      ) : list.length === 0 ? (
        <div className="card mt-6 p-12 text-center text-ink-3">50 km içinde konumunu paylaşan işletme yok.</div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <li key={b.id}>
              <BusinessCard b={b} distanceKm={b.distance_km} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
