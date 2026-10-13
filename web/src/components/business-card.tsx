import Link from "next/link";
import { MapPin, Navigation, Star } from "lucide-react";
import { GlowCard } from "@/components/glow-card";
import { categoryLabel } from "@/lib/constants";
import type { Business } from "@/lib/types";

export type BusinessCardData = Pick<
  Business,
  "id" | "slug" | "name" | "category" | "city" | "district" | "logo_url" | "cover_url" | "rating_avg" | "rating_count"
>;

/** Keşfet kartı. distanceKm verilirse ("Yakınımda") uzaklık da yazılır. */
export function BusinessCard({ b, distanceKm }: { b: BusinessCardData; distanceKm?: number }) {
  return (
    <GlowCard className="card h-full">
      <Link href={`/${b.slug}`} className="block h-full overflow-hidden rounded-[inherit]">
        <div className="h-32 bg-gradient-to-br from-brand-900/60 to-surface-2">
          {b.cover_url && <img src={b.cover_url} alt="" className="size-full object-cover" />}
        </div>
        <div className="flex gap-3 p-4">
          <div className="-mt-10 size-14 shrink-0 overflow-hidden rounded-xl border-4 border-bg bg-brand-700 shadow">
            {b.logo_url ? (
              <img src={b.logo_url} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-lg font-bold text-white">{b.name.charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{b.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              {categoryLabel(b.category)}
              {b.rating_count > 0 && (
                <span className="flex items-center gap-0.5 font-medium text-ink-2">
                  · <Star className="size-3.5 fill-amber-400 text-amber-400" /> {Number(b.rating_avg).toFixed(1)}
                </span>
              )}
            </p>
            {(b.city || distanceKm !== undefined) && (
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-3">
                {distanceKm !== undefined ? (
                  <>
                    <Navigation className="size-3.5" /> {distanceKm.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km
                    {b.district || b.city ? ` · ${[b.district, b.city].filter(Boolean).join(", ")}` : ""}
                  </>
                ) : (
                  <>
                    <MapPin className="size-3.5" /> {[b.district, b.city].filter(Boolean).join(", ")}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </Link>
    </GlowCard>
  );
}
