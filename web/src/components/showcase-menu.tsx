"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

/**
 * Vitrin sayfasının menüsü ya da ürün listesi. Dükkân sayfası önbellekte olduğu için ürünler sayfaya gömülmez,
 * tarayıcıda her açılışta okunur (bayat kalmasın). Ürün yoksa başlık da çıkmaz.
 */
export function ShowcaseMenu({ businessId, label }: { businessId: string; label: "Menü" | "Ürünler" }) {
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    createClient()
      .from("menu_items")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at")
      .then(({ data }) => setItems((data ?? []) as MenuItem[]));
  }, [businessId]);

  if (items.length === 0) return null;

  // Kategoriler ilk göründükleri sırayla; kategorisizler başlıksız ve en üstte.
  const groups = new Map<string, MenuItem[]>();
  for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : 0));

  return (
    <section id="menu" className="mt-8 scroll-mt-28">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <UtensilsCrossed className="size-4 text-accent" /> {label}
      </h2>
      <div className="space-y-6">
        {ordered.map(([category, list]) => (
          <div key={category || "kategorisiz"}>
            {category && <h3 className="mb-2 text-sm font-semibold text-ink-2">{category}</h3>}
            <ul className="card divide-y divide-line">
              {list.map((i) => (
                <li key={i.id} className="flex items-start gap-3 p-4">
                  {i.image_url && (
                    <Image src={i.image_url} alt="" width={160} height={160} sizes="80px" className="size-20 shrink-0 rounded-xl object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.name}</p>
                    {i.description && <p className="mt-0.5 text-sm text-ink-3">{i.description}</p>}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{formatPrice(i.price)}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
