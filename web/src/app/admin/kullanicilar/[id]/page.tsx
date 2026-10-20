"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, Mail, Phone, ShieldCheck, Star, Store, UserX, Wallet, XCircle } from "lucide-react";
import { CsvButton, Empty, PageTitle, Section, Skeleton, TONE, dateTime, shortDate } from "@/components/admin/ui";
import { Donut, KpiCard, STATUS_COLORS } from "@/components/charts";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import type { AdminUser } from "@/lib/admin-types";
import type { Appointment, AppointmentStatus, Review } from "@/lib/types";

type Appt = Appointment & { businesses: { name: string; slug: string } | null };
type Rev = Review & { businesses: { name: string } | null };

/** Bir kullanıcının hesabı, randevu geçmişi ve yorumları. */
export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ user: AdminUser | null; appts: Appt[]; reviews: Rev[] } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      // Yeni imza (p_id) yoksa tüm liste çekilip içinden bulunur.
      supabase.rpc("admin_users", { p_id: id }).then(async (r) => (r.error ? await supabase.rpc("admin_users") : r)),
      supabase.from("appointments").select("*, businesses(name, slug)").eq("customer_id", id).order("starts_at", { ascending: false }).limit(500),
      supabase.from("reviews").select("*, businesses(name)").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    ]).then(([u, a, r]) =>
      setData({
        user: ((u.data ?? []) as AdminUser[]).find((x) => x.id === id) ?? null,
        appts: (a.data ?? []) as Appt[],
        reviews: (r.data ?? []) as Rev[],
      }),
    );
  }, [id]);

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const { user, appts, reviews } = data;
  if (!user) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/kullanicilar" className="btn btn-ghost -ml-3">
          <ArrowLeft className="size-4" /> Kullanıcılar
        </Link>
        <Empty>Kullanıcı bulunamadı (silinmiş olabilir).</Empty>
      </div>
    );
  }

  const count = (s: AppointmentStatus) => appts.filter((a) => a.status === s).length;
  const spent = appts.filter((a) => a.status === "completed").reduce((s, a) => s + Number(a.price), 0);
  const places = new Set(appts.map((a) => a.business_id)).size;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/kullanicilar" className="btn btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" /> Kullanıcılar
      </Link>
      <PageTitle title={user.full_name || "İsimsiz kullanıcı"} hint={`Kayıt ${shortDate(user.created_at)} · son giriş ${dateTime(user.last_sign_in_at)}`}>
        <CsvButton
          filename={`kullanici-${user.id.slice(0, 8)}-randevular`}
          rows={appts.map((a) => ({ tarih: dateTime(a.starts_at), isletme: a.businesses?.name ?? "", hizmet: a.service_name, tutar: Number(a.price), durum: STATUS[a.status].label }))}
        />
      </PageTitle>

      <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Section title="Hesap">
          <ul className="mt-3 space-y-2.5 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="size-4 text-ink-3" />
              <a href={`mailto:${user.email}`} className="truncate hover:text-accent">
                {user.email}
              </a>
              {!user.email_confirmed_at && <span className={`chip px-1.5 py-0 text-3xs ${TONE.amber}`}>doğrulanmadı</span>}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 text-ink-3" /> {user.phone || "—"}
            </li>
            <li className="flex items-center gap-2">
              {user.is_admin ? (
                <span className="chip gap-1 bg-gold/10 text-gold ring-1 ring-gold/20">
                  <ShieldCheck className="size-3" /> Yönetici
                </span>
              ) : (
                <span className={`chip ${user.role === "business" ? TONE.brand : TONE.muted}`}>{user.role === "business" ? "İşletme sahibi" : "Müşteri"}</span>
              )}
            </li>
            {user.business_id && (
              <li>
                <Link href={`/admin/isletmeler/${user.business_id}`} className="flex items-center gap-2 rounded-xl bg-brand-400/10 px-3 py-2 text-accent ring-1 ring-brand-400/20">
                  <Store className="size-4" /> {user.business_name}
                </Link>
              </li>
            )}
          </ul>
          <p className="mt-4 break-all font-mono text-2xs text-ink-3">{user.id}</p>
        </Section>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiCard label="Randevu" icon={CalendarCheck} value={String(appts.length)} hint={`${places} farklı işletme`} />
          <KpiCard label="Harcama" icon={Wallet} value={formatPrice(spent)} hint="Tamamlanan randevular" />
          <KpiCard label="Yorum" icon={Star} value={String(reviews.length)} hint={reviews.length ? `ortalama ${(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}` : undefined} />
          <KpiCard label="Tamamlanan" icon={CalendarCheck} value={String(count("completed"))} />
          <KpiCard label="Kendi iptali" icon={XCircle} value={String(appts.filter((a) => a.status === "cancelled" && a.cancelled_by === "customer").length)} tone={appts.filter((a) => a.status === "cancelled" && a.cancelled_by === "customer").length >= 3 ? "warn" : undefined} />
          <KpiCard label="Gelmedi" icon={UserX} value={String(count("no_show"))} tone={count("no_show") >= 2 ? "bad" : undefined} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Section title="Randevular">
          {appts.length === 0 ? (
            <Empty>Randevusu yok.</Empty>
          ) : (
            <div className="mt-3 max-h-[36rem] overflow-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs text-ink-3">
                  <tr className="border-b border-line">
                    <th className="py-2 font-medium">Tarih</th>
                    <th className="py-2 font-medium">İşletme</th>
                    <th className="py-2 font-medium">Hizmet</th>
                    <th className="py-2 text-right font-medium">Tutar</th>
                    <th className="py-2 pl-3 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {appts.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 text-xs tabular-nums text-ink-2">{dateTime(a.starts_at)}</td>
                      <td className="py-2">
                        <Link href={`/admin/isletmeler/${a.business_id}`} className="hover:text-accent">
                          {a.businesses?.name ?? "—"}
                        </Link>
                      </td>
                      <td className="py-2 text-ink-2">{a.service_name}</td>
                      <td className="py-2 text-right tabular-nums">{formatPrice(a.price)}</td>
                      <td className="py-2 pl-3">
                        <span className={`chip ${STATUS[a.status].className}`}>{STATUS[a.status].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <div className="space-y-4">
          <Section title="Durum dağılımı">
            <Donut title="Randevu durumları" items={(Object.keys(STATUS) as AppointmentStatus[]).map((s) => ({ label: STATUS[s].label, value: count(s), color: STATUS_COLORS[s] }))} />
          </Section>
          <Section title="Yorumları">
            {reviews.length === 0 ? (
              <Empty>Yorum yazmamış.</Empty>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.businesses?.name ?? "—"}</span>
                      <span className="flex shrink-0">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className={`size-3 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
                        ))}
                      </span>
                    </div>
                    {r.comment && <p className="mt-0.5 text-ink-3">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
