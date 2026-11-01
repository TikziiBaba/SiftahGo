"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dateTime, Empty, PageTitle, Skeleton, Tabs, TONE } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_CATEGORIES } from "@/lib/constants";
import { errorMessage } from "@/lib/format";
import type { SupportStatus, SupportTicket } from "@/lib/types";

type Row = SupportTicket & { user: { full_name: string } | null; business: { name: string } | null };

const FILTERS: { id: SupportStatus; label: string }[] = [
  { id: "waiting", label: "Yanıt bekleyen" },
  { id: "answered", label: "Yanıtlanan" },
  { id: "closed", label: "Kapalı" },
];

/** Müşteri ve işletme sahiplerinin destek talepleri. Yanıt ve kapatma talep sayfasından yapılır. */
export default function AdminSupport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<SupportStatus>("waiting");

  useEffect(() => {
    createClient()
      .from("support_tickets")
      .select("*, user:profiles(full_name), business:businesses(name)")
      .order("last_message_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) return setError(errorMessage(error));
        setRows((data ?? []) as unknown as Row[]);
      });
  }, []);

  if (error) return <p className="mx-auto max-w-4xl rounded-2xl bg-rose-500/10 p-4 text-sm text-bad">{error}</p>;

  const list = rows?.filter((r) => r.status === filter) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Destek talepleri" hint="Yanıtınız kullanıcıya e-postayla da gider. Kullanıcı kapalı talebe yazarsa talep yeniden açılır." />

      <div className="mt-6">
        <Tabs value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: rows?.filter((r) => r.status === f.id).length ?? 0 }))} />
      </div>

      {!rows ? (
        <Skeleton className="mt-4 h-72" />
      ) : list.length === 0 ? (
        <div className="card mt-4">
          <Empty>Bu bölümde talep yok.</Empty>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/destek/${r.id}`} className="card flex flex-wrap items-center gap-3 p-4 transition hover:ring-line-strong">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block truncate font-semibold">{r.subject}</span>
                  <span className="block truncate text-sm text-ink-3">
                    {r.user?.full_name || "Kullanıcı"}
                    {r.business && ` · ${r.business.name}`} · {SUPPORT_CATEGORIES[r.category]} · {dateTime(r.last_message_at)}
                  </span>
                </span>
                <span className={`chip ${r.audience === "business" ? TONE.brand : TONE.muted}`}>{r.audience === "business" ? "İşletme" : "Müşteri"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
