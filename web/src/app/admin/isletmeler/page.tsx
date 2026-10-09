"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { businessState, CsvButton, Empty, PageTitle, Skeleton, Tabs, shortDate } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, categoryLabel } from "@/lib/constants";
import { errorMessage } from "@/lib/format";
import type { AdminUser } from "@/lib/admin-types";
import type { Business, Plan } from "@/lib/types";

type Row = Business & {
  created_at: string;
  staff: { count: number }[];
  services: { count: number }[];
  appointments: { count: number }[];
};

const FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "live", label: "Yayında" },
  { id: "expiring", label: "Bitmek üzere" },
  { id: "expired", label: "Süresi doldu" },
  { id: "never", label: "Paketsiz" },
  { id: "hidden", label: "Sahibi gizledi" },
  { id: "suspended", label: "Askıda" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const SORTS = [
  { id: "new", label: "En yeni" },
  { id: "ends", label: "Bitiş tarihi" },
  { id: "name", label: "Ada göre" },
  { id: "appointments", label: "En çok randevu" },
  { id: "rating", label: "En yüksek puan" },
] as const;

export default function AdminBusinesses() {
  const params = useSearchParams();
  const [data, setData] = useState<{ rows: Row[]; owners: Map<string, AdminUser>; plans: Plan[]; now: number } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>(() => (FILTERS.some((f) => f.id === params.get("durum")) ? (params.get("durum") as Filter) : "all"));
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("businesses").select("*, staff(count), services(count), appointments(count)").order("created_at", { ascending: false }).limit(2000),
      supabase.rpc("admin_users"),
      supabase.from("plans").select("*").order("sort_order"),
    ]).then(([b, u, p]) => {
      if (b.error || u.error) return setError(errorMessage(b.error ?? u.error));
      setData({
        rows: (b.data ?? []) as Row[],
        owners: new Map(((u.data ?? []) as AdminUser[]).map((x) => [x.id, x])),
        plans: (p.data ?? []) as Plan[],
        now: Date.now(),
      });
    });
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const withState = data.rows.map((b) => ({ b, state: businessState(b, data.now), owner: data.owners.get(b.owner_id) }));
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, 0])) as Record<Filter, number>;
    counts.all = withState.length;
    for (const x of withState) counts[x.state.key as Filter] += 1;
    // "Bitmek üzere" olanlar yayında da sayılır.
    counts.live += counts.expiring;

    const term = q.trim().toLocaleLowerCase("tr-TR");
    const list = withState
      .filter(({ state }) => filter === "all" || state.key === filter || (filter === "live" && state.key === "expiring"))
      .filter(({ b }) => !plan || b.plan_id === plan)
      .filter(({ b }) => !category || b.category === category)
      .filter(({ b }) => !city || b.city === city)
      .filter(
        ({ b, owner }) =>
          !term ||
          [b.name, b.slug, b.city, b.district, b.phone, owner?.email, owner?.full_name, owner?.phone]
            .some((v) => v?.toLocaleLowerCase("tr-TR").includes(term)),
      );
    const apptCount = (b: Row) => b.appointments[0]?.count ?? 0;
    list.sort((x, y) => {
      if (sort === "name") return x.b.name.localeCompare(y.b.name, "tr");
      if (sort === "appointments") return apptCount(y.b) - apptCount(x.b);
      if (sort === "rating") return Number(y.b.rating_avg) - Number(x.b.rating_avg) || y.b.rating_count - x.b.rating_count;
      if (sort === "ends") return (x.b.subscription_ends_at ?? "9999").localeCompare(y.b.subscription_ends_at ?? "9999");
      return y.b.created_at.localeCompare(x.b.created_at);
    });
    const cities = [...new Set(data.rows.map((b) => b.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    return { list, counts, cities };
  }, [data, filter, q, plan, category, city, sort]);

  if (error) return <p className="mx-auto max-w-6xl rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;

  const planName = (id: string | null) => data?.plans.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="İşletmeler" hint={view ? `${view.list.length} / ${data!.rows.length} işletme` : "Yükleniyor…"}>
        <CsvButton
          filename="isletmeler"
          rows={(view?.list ?? []).map(({ b, state, owner }) => ({
            Ad: b.name,
            Adres: b.slug,
            Kategori: categoryLabel(b.category),
            Şehir: b.city,
            İlçe: b.district,
            Telefon: b.phone,
            Sahip: owner?.full_name ?? "",
            "Sahip e-posta": owner?.email ?? "",
            Durum: state.label,
            Paket: planName(b.plan_id),
            "Bitiş": b.subscription_ends_at ?? "",
            Personel: b.staff[0]?.count ?? 0,
            Hizmet: b.services[0]?.count ?? 0,
            Randevu: b.appointments[0]?.count ?? 0,
            Puan: b.rating_avg,
            Kayıt: b.created_at,
          }))}
        />
      </PageTitle>

      <div className="mt-6">
        <Tabs value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: view?.counts[f.id] }))} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
          <input className="input pl-9" placeholder="Ad, adres, şehir, sahip e-postası…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Paket">
          <option value="">Tüm paketler</option>
          {data?.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
          <option value="">Tüm kategoriler</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="input" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Şehir">
          <option value="">Tüm şehirler</option>
          {view?.cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sıralama">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {!view ? (
        <Skeleton className="mt-4 h-96" />
      ) : view.list.length === 0 ? (
        <div className="card mt-4">
          <Empty>Bu filtreye uyan işletme yok.</Empty>
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">İşletme</th>
                <th className="px-4 py-3 font-medium">Sahip</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Paket · bitiş</th>
                <th className="px-4 py-3 text-right font-medium">Personel</th>
                <th className="px-4 py-3 text-right font-medium">Randevu</th>
                <th className="px-4 py-3 text-right font-medium">Puan</th>
                <th className="px-4 py-3 font-medium">Kayıt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.list.map(({ b, state, owner }) => (
                <tr key={b.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/isletmeler/${b.id}`} className="font-medium hover:text-brand-300">
                      {b.name}
                    </Link>
                    <p className="text-xs text-ink-3">
                      {categoryLabel(b.category)} · {b.city || "şehir yok"}
                    </p>
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    <p className="truncate">{owner?.full_name || "—"}</p>
                    <p className="truncate text-xs text-ink-3">{owner?.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${state.className}`}>{state.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p>{planName(b.plan_id)}</p>
                    <p className="text-xs text-ink-3">{shortDate(b.subscription_ends_at)}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.staff[0]?.count ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.appointments[0]?.count ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {b.rating_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" /> {Number(b.rating_avg).toFixed(1)}
                        <span className="text-xs text-ink-3">({b.rating_count})</span>
                      </span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">{shortDate(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
