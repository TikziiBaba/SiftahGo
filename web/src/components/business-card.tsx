import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { MapPin, Navigation, Star } from "lucide-react";
import { GlowCard } from "@/components/glow-card";
import { CategoryIcon } from "@/lib/category-icons";
import { categoryLabel } from "@/lib/constants";
import type { Business } from "@/lib/types";

export type BusinessCardData = Pick<
  Business,
  "id" | "slug" | "name" | "category" | "city" | "district" | "logo_url" | "cover_url" | "rating_avg" | "rating_count"
>;

/**
 * Keşfet kartı ile işletme sayfasındaki aynı parçayı (kapak, logo) eşler: sayfa açılırken parça yerine uçar
 * (globals.css .morph). Aynı ad sayfada iki kez olursa tarayıcı geçişi iptal eder; on yalnızca işletmenin
 * sayfada bir kez göründüğü yerde verilir.
 */
export function Morph({ id, part, on = true, children }: { id: string; part: "kapak" | "logo"; on?: boolean; children: React.ReactNode }) {
  if (!on) return children;
  return (
    <ViewTransition name={`${part}-${id}`} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

/** Keşfet kartı. distanceKm verilirse ("Yakınımda") uzaklık da yazılır; morph: bkz. Morph. */
export function BusinessCard({ b, distanceKm, morph = false }: { b: BusinessCardData; distanceKm?: number; morph?: boolean }) {
  const place = [
    distanceKm !== undefined ? `${distanceKm.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km` : "",
    [b.district, b.city].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const PlaceIcon = distanceKm !== undefined ? Navigation : MapPin;
  return (
    <GlowCard className="card group h-full">
      <Link href={`/${b.slug}`} className="block h-full overflow-hidden rounded-[inherit]">
        <Morph id={b.id} part="kapak" on={morph}>
          <div className="relative h-32 overflow-hidden bg-gradient-to-br from-brand-400/25 via-brand-300/10 to-surface-2">
            {b.cover_url ? (
              <Image
                src={b.cover_url}
                alt=""
                fill
                sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-700 ease-spring group-hover:scale-[1.04]"
              />
            ) : (
              // Kapak görseli yoksa zeminde kategorinin ikonu durur.
              <CategoryIcon
                id={b.category}
                aria-hidden
                className="absolute -bottom-5 right-5 size-28 text-accent/10 transition-transform duration-700 ease-spring group-hover:-rotate-6 group-hover:scale-105"
              />
            )}
          </div>
        </Morph>
        <div className="flex gap-3 p-4">
          <Morph id={b.id} part="logo" on={morph}>
            <div className="-mt-10 size-14 shrink-0 overflow-hidden rounded-xl border-4 border-bg bg-brand-700 shadow">
              {b.logo_url ? (
                <Image src={b.logo_url} alt="" width={56} height={56} className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-lg font-bold text-white">{b.name.charAt(0)}</span>
              )}
            </div>
          </Morph>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold transition-colors duration-300 group-hover:text-accent-strong">{b.name}</p>
            <p className="truncate text-sm text-ink-3">{categoryLabel(b.category)}</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-ink-3">
              {b.rating_count > 0 ? (
                <span className="flex shrink-0 items-center gap-1 font-medium text-ink-2">
                  <Star className="size-3.5 fill-gold text-gold" /> {Number(b.rating_avg).toFixed(1)}
                  <span className="font-normal text-ink-3">({b.rating_count})</span>
                </span>
              ) : (
                <span className="chip shrink-0 bg-brand-400/10 px-2 text-accent-strong">Yeni</span>
              )}
              {place && (
                <span className="flex min-w-0 items-center gap-1">
                  <PlaceIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{place}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </GlowCard>
  );
}
