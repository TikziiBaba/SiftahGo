"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle, Phone, RotateCcw } from "lucide-react";
import { ReviewActions } from "@/components/admin/review";
import { dateTime, Empty, PageTitle, Skeleton, Tabs, TONE } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { categoryLabel } from "@/lib/constants";
import { errorMessage, intlPhone } from "@/lib/format";
import type { AdminUser } from "@/lib/admin-types";
import type { Business } from "@/lib/types";

const FILTERS = [
  { id: "pending", label: "Onay bekleyen" },
  { id: "rejected", label: "Reddedilen" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/** İşletme başvuruları: yetkili bilgileri kontrol edip onaylar ya da sebebiyle reddeder. */
export default function AdminApplications() {
  const [data, setData] = useState<{ rows: Business[]; users: Map<string, AdminUser> } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [b, u] = await Promise.all([
      supabase.from("businesses").select("*").neq("approval_status", "approved").order("submitted_at"),
      supabase.rpc("admin_users"),
    ]);
    if (b.error || u.error) return setError(errorMessage(b.error ?? u.error));
    setData({
      rows: (b.data ?? []) as Business[],
      users: new Map(((u.data ?? []) as AdminUser[]).map((x) => [x.id, x])),
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- başvuruları ilk açılışta yükle
    load();
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const pending = data.rows.filter((b) => b.approval_status === "pending");
    // Reddedilenler en son incelenen üstte; bekleyenler sıradaki (en eski başvuru) üstte.
    const rejected = data.rows
      .filter((b) => b.approval_status === "rejected")
      .sort((x, y) => (y.reviewed_at ?? "").localeCompare(x.reviewed_at ?? ""));
    return { list: filter === "pending" ? pending : rejected, counts: { pending: pending.length, rejected: rejected.length } };
  }, [data, filter]);

  if (error) return <p className="mx-auto max-w-4xl rounded-2xl bg-rose-500/10 p-4 text-sm text-bad">{error}</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Başvurular"
        hint="Yeni işletmeler onaylanana kadar görünmez ve randevu almaz. Onayda 7 günlük Pro denemesi başlar."
      />

      <div className="mt-6">
        <Tabs value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: view?.counts[f.id] }))} />
      </div>

      {!view ? (
        <Skeleton className="mt-4 h-72" />
      ) : view.list.length === 0 ? (
        <div className="card mt-4">
          <Empty>{filter === "pending" ? "Onay bekleyen başvuru yok." : "Reddedilen başvuru yok."}</Empty>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {view.list.map((b) => {
            const owner = data!.users.get(b.owner_id);
            const reviewer = b.reviewed_by ? data!.users.get(b.reviewed_by) : undefined;
            return (
              <li key={b.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/isletmeler/${b.id}`} className="text-lg font-semibold hover:text-accent">
                    {b.name}
                  </Link>
                  {b.approval_status === "pending" && b.approval_note && (
                    <span className={`chip gap-1 ${TONE.sky}`}>
                      <RotateCcw className="size-3" /> Yeniden başvuru
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-ink-3">
                  {categoryLabel(b.category)} · /{b.slug} · Başvuru {dateTime(b.submitted_at)}
                </p>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-3">Adres</dt>
                    <dd className="mt-0.5">{[b.address, b.district, b.city].filter(Boolean).join(", ") || "—"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-3">İşletme telefonu</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {b.phone ? (
                        <>
                          <a href={`tel:${b.phone}`} className="chip gap-1 bg-tint/5 ring-1 ring-line hover:text-accent">
                            <Phone className="size-3" /> {b.phone}
                          </a>
                          <a href={`https://wa.me/${intlPhone(b.phone)}`} target="_blank" rel="noreferrer" className="chip gap-1 bg-tint/5 ring-1 ring-line hover:text-accent">
                            <MessageCircle className="size-3" /> WhatsApp
                          </a>
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-xs text-ink-3">Başvuran</dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                      {owner ? (
                        <>
                          <Link href={`/admin/kullanicilar/${owner.id}`} className="mr-1 hover:text-accent hover:underline">
                            {owner.full_name || "İsimsiz"}
                          </Link>
                          <a href={`mailto:${owner.email}`} className="chip gap-1 bg-tint/5 ring-1 ring-line hover:text-accent">
                            <Mail className="size-3" /> {owner.email}
                          </a>
                          {owner.phone && (
                            <a href={`tel:${owner.phone}`} className="chip gap-1 bg-tint/5 ring-1 ring-line hover:text-accent">
                              <Phone className="size-3" /> {owner.phone}
                            </a>
                          )}
                          {!owner.email_confirmed_at && <span className={`chip ${TONE.amber}`}>E-posta doğrulanmadı</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>

                {b.approval_note && (
                  <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">
                    <span className="font-medium">{b.approval_status === "pending" ? "Önceki ret sebebi" : "Ret sebebi"}:</span> {b.approval_note}
                    <span className="mt-1 block text-xs text-ink-3">
                      {dateTime(b.reviewed_at)}
                      {reviewer && ` · ${reviewer.email}`}
                    </span>
                  </p>
                )}

                <div className="mt-4 sm:max-w-sm">
                  <ReviewActions business={b} onDone={load} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
