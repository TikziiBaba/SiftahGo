"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dayLabel } from "@/components/admin/suspension";
import { dateTime, Empty, PageTitle, Skeleton, Tabs, TONE } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { FreezeRequest } from "@/lib/types";

type Row = FreezeRequest & { business: { name: string } | null };

const FILTERS = [
  { id: "pending", label: "Açık" },
  { id: "closed", label: "Sonuçlanan" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/** İşletme sahiplerinin dondurma talepleri. Uygulama ve ret işletme sayfasındaki yönetici işlemlerinden yapılır. */
export default function AdminFreezeRequests() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  useEffect(() => {
    createClient()
      .from("freeze_requests")
      .select("*, business:businesses(name)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) return setError(errorMessage(error));
        setRows((data ?? []) as unknown as Row[]);
      });
  }, []);

  if (error) return <p className="mx-auto max-w-4xl rounded-2xl bg-rose-500/10 p-4 text-sm text-bad">{error}</p>;

  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  const closed = rows?.filter((r) => r.status !== "pending") ?? [];
  const list = filter === "pending" ? pending : closed;

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Dondurma talepleri" hint="İşletme sahipleri askıya alamaz, buradan talep eder. Uygulamak veya reddetmek için işletmeyi açın." />

      <div className="mt-6">
        <Tabs value={filter} onChange={setFilter} options={[{ ...FILTERS[0], count: pending.length }, { ...FILTERS[1], count: closed.length }]} />
      </div>

      {!rows ? (
        <Skeleton className="mt-4 h-72" />
      ) : list.length === 0 ? (
        <div className="card mt-4">
          <Empty>{filter === "pending" ? "Açık talep yok." : "Sonuçlanan talep yok."}</Empty>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/isletmeler/${r.business_id}`} className="text-lg font-semibold hover:text-accent">
                  {r.business?.name ?? "İşletme"}
                </Link>
                {r.status === "approved" && <span className={`chip ${TONE.green}`}>Uygulandı</span>}
                {r.status === "rejected" && <span className={`chip ${TONE.rose}`}>Reddedildi</span>}
              </div>
              <p className="mt-0.5 text-sm text-ink-3">
                {dayLabel(r.starts_on)} – {dayLabel(r.ends_on)} · Talep {dateTime(r.created_at)}
              </p>
              <p className="mt-3 text-sm">{r.reason}</p>
              {r.admin_note && <p className="mt-2 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{r.admin_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
