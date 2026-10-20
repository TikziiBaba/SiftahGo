"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageSquareReply, MessageSquareText, Search, Star, ThumbsDown } from "lucide-react";
import { CsvButton, Empty, PageTitle, Section, Skeleton, Tabs, dateTime } from "@/components/admin/ui";
import { Donut, KpiCard } from "@/components/charts";
import { createClient } from "@/lib/supabase/client";
import type { Review } from "@/lib/types";

type Row = Review & { businesses: { id: string; name: string; slug: string } | null };
type Filter = "all" | "low" | "open" | "replied";

const n = (x: number) => new Intl.NumberFormat("tr-TR").format(x);

/** Tüm işletmelerin yorumları: düşük puanlar ve cevapsızlar hızlıca görülür (salt okuma). */
export default function AdminReviewsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    createClient()
      .from("reviews")
      .select("*, businesses(id, name, slug)")
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);

  const all = useMemo(() => rows ?? [], [rows]);
  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr");
    return all
      .filter((r) => (filter === "low" ? r.rating <= 2 : filter === "open" ? !r.reply : filter === "replied" ? !!r.reply : true))
      .filter((r) => !term || `${r.customer_name} ${r.comment} ${r.businesses?.name ?? ""}`.toLocaleLowerCase("tr").includes(term));
  }, [all, filter, q]);

  if (!rows) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const recent = all.filter((r) => now - new Date(r.created_at).getTime() < 30 * 864e5);
  const before = all.filter((r) => {
    const age = now - new Date(r.created_at).getTime();
    return age >= 30 * 864e5 && age < 60 * 864e5;
  });
  const avg = (l: Row[]) => (l.length ? l.reduce((s, r) => s + r.rating, 0) / l.length : 0);
  const open = all.filter((r) => !r.reply).length;
  const low = all.filter((r) => r.rating <= 2).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Yorumlar" hint="Tüm işletmelerin müşteri değerlendirmeleri">
        <CsvButton
          filename="yorumlar"
          rows={list.map((r) => ({ tarih: dateTime(r.created_at), isletme: r.businesses?.name ?? "", musteri: r.customer_name, puan: r.rating, yorum: r.comment, cevap: r.reply }))}
        />
      </PageTitle>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Son 30 gün yorum" icon={MessageSquareText} value={n(recent.length)} cur={recent.length} prev={before.length} hint={`Toplam ${n(all.length)}`} />
        <KpiCard label="Son 30 gün ortalama" icon={Star} value={recent.length ? avg(recent).toFixed(2) : "—"} cur={avg(recent)} prev={avg(before)} />
        <KpiCard label="Cevapsız" icon={MessageSquareReply} value={n(open)} hint={`%${all.length ? Math.round((open / all.length) * 100) : 0} cevaplanmamış`} tone={open ? "warn" : undefined} />
        <KpiCard label="Düşük puan (1–2)" icon={ThumbsDown} value={n(low)} tone={low ? "bad" : undefined} hint="İncelenmesi önerilir" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Section title="Puan dağılımı">
          <Donut
            title="Puan dağılımı"
            items={[5, 4, 3, 2, 1].map((k, i) => ({ label: `${k} yıldız`, value: all.filter((r) => r.rating === k).length, color: ["#0ca30c", "#5cb85c", "#fab219", "#ec835a", "#d03b3b"][i] }))}
            center={{ value: avg(all).toFixed(2), label: "ortalama" }}
          />
        </Section>
        <Section
          title="Yorumlar"
          action={
            <Tabs
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "Tümü", count: all.length },
                { id: "low", label: "Düşük puan", count: low },
                { id: "open", label: "Cevapsız", count: open },
                { id: "replied", label: "Cevaplı", count: all.length - open },
              ]}
            />
          }
        >
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input className="input pl-9" placeholder="Müşteri, işletme veya yorum içinde ara" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.length === 0 ? (
            <Empty>Bu süzgeçte yorum yok.</Empty>
          ) : (
            <ul className="mt-3 max-h-[40rem] divide-y divide-line overflow-y-auto pr-1">
              {list.slice(0, 300).map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="flex">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`size-3.5 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
                      ))}
                    </span>
                    <span className="font-medium">{r.customer_name}</span>
                    <span className="text-ink-3">→</span>
                    {r.businesses ? (
                      <Link href={`/admin/isletmeler/${r.businesses.id}`} className="text-accent hover:underline">
                        {r.businesses.name}
                      </Link>
                    ) : (
                      <span className="text-ink-3">Silinmiş işletme</span>
                    )}
                    <span className="ml-auto text-xs text-ink-3">{dateTime(r.created_at)}</span>
                  </div>
                  {r.comment && <p className={`mt-1 ${r.rating <= 2 ? "text-rose-200" : "text-ink-2"}`}>{r.comment}</p>}
                  {r.reply ? (
                    <p className="mt-1.5 rounded-lg border-l-2 border-brand-400/40 bg-tint/[0.03] px-3 py-1.5 text-xs text-ink-2">
                      <b className="text-accent">İşletme:</b> {r.reply}
                    </p>
                  ) : (
                    <p className="mt-1 text-2xs font-medium text-warn">Cevap bekliyor</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {list.length > 300 && <p className="mt-2 text-xs text-ink-3">İlk 300 yorum gösteriliyor; CSV ile tümünü indirin.</p>}
        </Section>
      </div>
    </div>
  );
}
