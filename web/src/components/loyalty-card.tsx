"use client";

import { useEffect, useState } from "react";
import { Check, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MyLoyalty } from "@/lib/types";

/** İşletme sayfasındaki sadakat kartı. Önbellekteki sayfaya gömülmez: damga kişiye özel, tarayıcıda okunur. */
export function LoyaltyCard({ businessId }: { businessId: string }) {
  // undefined: okunuyor (yer tutucu görünür, kart gelince sayfa kaymaz); null: kart yok.
  const [card, setCard] = useState<MyLoyalty | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    createClient()
      .rpc("my_loyalty", { p_business_id: businessId })
      .then(({ data }) => {
        if (active) setCard((data as MyLoyalty | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  if (card === undefined) return <div aria-hidden className="card mt-5 h-[8.125rem] animate-pulse" />;
  if (!card) return null;
  const left = card.target - card.stamps;

  return (
    <section aria-label="Sadakat kartı" className="card mt-5 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Gift className="size-4.5 text-accent" /> Sadakat kartı
      </p>
      {card.available > 0 && (
        <p className="mt-2 rounded-xl bg-emerald-400/10 p-3 text-sm font-medium text-ok">
          Ödülünüz hazır: {card.reward}. Gelişinizde işletmeye söyleyin.
        </p>
      )}
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${card.stamps} / ${card.target} damga`}>
        {Array.from({ length: card.target }, (_, i) => (
          <li
            key={i}
            className={`grid size-7 place-items-center rounded-full ring-1 ${i < card.stamps ? "bg-brand-400/15 text-accent ring-brand-400/40" : "text-ink-3 ring-line"}`}
          >
            {i < card.stamps ? <Check className="size-3.5" /> : <span className="text-xs">{i + 1}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-2">
        {left === 1 ? "Bir sonraki randevunuzda" : `${left} randevu sonra`}: <strong className="font-medium text-ink">{card.reward}</strong>
      </p>
    </section>
  );
}
