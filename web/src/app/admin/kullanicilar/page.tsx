"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { CsvButton, dateTime, Empty, PageTitle, shortDate, Skeleton, Tabs, TONE } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import type { AdminUser } from "@/lib/admin-types";

const FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "customer", label: "Müşteri" },
  { id: "business", label: "İşletme" },
  { id: "admin", label: "Yönetici" },
  { id: "unconfirmed", label: "E-posta doğrulanmamış" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const match = (u: AdminUser, f: Filter) =>
  f === "all" ||
  (f === "admin" && u.is_admin) ||
  (f === "unconfirmed" && !u.email_confirmed_at) ||
  (f === "customer" && u.role === "customer") ||
  (f === "business" && u.role === "business");

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    createClient()
      .rpc("admin_users")
      .then(({ data, error }) => {
        if (error) return setError(errorMessage(error));
        setUsers((data ?? []) as AdminUser[]);
      });
  }, []);

  const list = useMemo(() => {
    if (!users) return null;
    const term = q.trim().toLocaleLowerCase("tr-TR");
    return users
      .filter((u) => match(u, filter))
      .filter((u) => !term || [u.email, u.full_name, u.phone, u.business_name].some((v) => v?.toLocaleLowerCase("tr-TR").includes(term)));
  }, [users, filter, q]);

  if (error) return <p className="mx-auto max-w-6xl rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Kullanıcılar" hint={list ? `${list.length} / ${users!.length} kullanıcı` : "Yükleniyor…"}>
        <CsvButton
          filename="kullanicilar"
          rows={(list ?? []).map((u) => ({
            "Ad soyad": u.full_name,
            "E-posta": u.email,
            Telefon: u.phone ?? "",
            Rol: u.is_admin ? "Yönetici" : u.role === "business" ? "İşletme" : "Müşteri",
            İşletme: u.business_name ?? "",
            Randevu: u.appointment_count,
            "E-posta doğrulandı": !!u.email_confirmed_at,
            Kayıt: u.created_at,
            "Son giriş": u.last_sign_in_at ?? "",
          }))}
        />
      </PageTitle>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Tabs value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: users?.filter((u) => match(u, f.id)).length }))} />
        <label className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
          <input className="input pl-9" placeholder="Ad, e-posta, telefon, işletme…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {!list ? (
        <Skeleton className="mt-4 h-96" />
      ) : list.length === 0 ? (
        <div className="card mt-4">
          <Empty>Bu filtreye uyan kullanıcı yok.</Empty>
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">İşletme</th>
                <th className="px-4 py-3 text-right font-medium">Randevu</th>
                <th className="px-4 py-3 font-medium">Kayıt</th>
                <th className="px-4 py-3 font-medium">Son giriş</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((u) => (
                <tr key={u.id} className="transition hover:bg-white/[0.02]">
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate font-medium">{u.full_name || "İsimsiz"}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                      <a href={`mailto:${u.email}`} className="truncate hover:text-brand-300">{u.email}</a>
                      {!u.email_confirmed_at && <span className={`chip px-1.5 py-0 text-[10px] ${TONE.amber}`}>doğrulanmadı</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{u.phone || "—"}</td>
                  <td className="px-4 py-3">
                    {u.is_admin ? (
                      <span className="chip gap-1 bg-gold/10 text-gold ring-1 ring-gold/20">
                        <ShieldCheck className="size-3" /> Yönetici
                      </span>
                    ) : (
                      <span className={`chip ${u.role === "business" ? TONE.brand : TONE.muted}`}>{u.role === "business" ? "İşletme" : "Müşteri"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.business_id ? (
                      <Link href={`/admin/isletmeler/${u.business_id}`} className="hover:text-brand-300">
                        {u.business_name}
                      </Link>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.appointment_count}</td>
                  <td className="px-4 py-3 text-xs text-ink-3">{shortDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-ink-3">{dateTime(u.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
