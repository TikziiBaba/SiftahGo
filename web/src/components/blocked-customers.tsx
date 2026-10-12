"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatDate } from "@/lib/format";
import type { BlockedCustomer } from "@/lib/types";

/** İşletmenin engellediği müşteriler (randevu satırındaki "Engelle" ile eklenir); engel buradan kaldırılır. */
export function BlockedCustomers({ businessId }: { businessId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<BlockedCustomer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("blocked_customers")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as BlockedCustomer[]));
  }, [supabase, businessId]);

  async function unblock(id: string) {
    setError("");
    const { error } = await supabase.from("blocked_customers").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <section>
      <h2 className="text-xl font-bold">Engellenen müşteriler</h2>
      <p className="mt-1 text-sm text-ink-3">
        Engellenen müşteri sayfanızdan online randevu alamaz (hesabı ve telefon numarası). Randevu listesindeki
        &quot;Engelle&quot; ile eklenir.
      </p>
      <div className="card mt-4 p-2">
        {rows === null ? (
          <div className="h-12 animate-pulse rounded-xl bg-surface-2" />
        ) : rows.length === 0 ? (
          <p className="p-3 text-sm text-ink-3">Engellenen müşteri yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                <Ban className="size-4 shrink-0 text-rose-400" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.customer_name || "İsimsiz"}</span>
                  <span className="text-ink-3">
                    {r.phone_key && ` · 0${r.phone_key}`} · {formatDate(r.created_at, { weekday: undefined })}
                  </span>
                </span>
                <button className="btn btn-ghost py-1.5" onClick={() => unblock(r.id)}>Engeli kaldır</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </section>
  );
}
