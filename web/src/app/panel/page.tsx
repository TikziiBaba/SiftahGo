"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  LayoutList,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  Rows3,
  Star,
  StickyNote,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { KpiCard } from "@/components/charts";
import { useBusiness } from "@/components/panel-context";
import { DayCalendar, WeekView } from "@/components/panel-schedule";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import {
  addDays,
  dayBounds,
  dayOf,
  errorMessage,
  formatDate,
  formatPrice,
  formatTime,
  isoWeekday,
  phoneKey,
  reminderText,
  toIso,
  todayStr,
  untilText,
  whatsappLink,
} from "@/lib/format";
import { useAccount } from "@/lib/use-account";
import type { Appointment, AppointmentStatus, Review, Service, SessionPackage, Staff, StaffService, WorkingHour } from "@/lib/types";

type Row = Appointment & { staff: { name: string } | null };
type View = "liste" | "takvim" | "hafta";
type Trend = { starts_at: string; status: AppointmentStatus; price: number };

const VIEWS: { id: View; label: string; icon: typeof LayoutList }[] = [
  { id: "liste", label: "Liste", icon: LayoutList },
  { id: "takvim", label: "Gün takvimi", icon: Rows3 },
  { id: "hafta", label: "Hafta", icon: CalendarDays },
];

function greeting(hour: number) {
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

const earned = (rows: Trend[]) => rows.filter((r) => r.status === "completed" || r.status === "confirmed").reduce((s, r) => s + Number(r.price), 0);

export default function AppointmentsPage() {
  const { business } = useBusiness();
  const account = useAccount();
  const supabase = createClient();
  const [day, setDay] = useState(todayStr);
  const [view, setView] = useState<View>("liste");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [weekRows, setWeekRows] = useState<Row[]>([]);
  // Müşteri defterindeki notlar (telefonun son 10 hanesi -> not)
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Günün müşterilerinin seans paketleri
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [pending, setPending] = useState<Row[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [links, setLinks] = useState<StaffService[]>([]);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [strip, setStrip] = useState<Record<string, number>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<Row | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [allPending, setAllPending] = useState(false);
  const [copied, setCopied] = useState(false);
  // Saat, veri yüklenirken alınır (render sırasında okunmaz).
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState("");
  const today = todayStr();
  const weekStart = addDays(day, 1 - isoWeekday(day));

  const load = useCallback(async () => {
    const { from, to } = dayBounds(day);
    const [a, p] = await Promise.all([
      supabase.from("appointments").select("*, staff(name)").eq("business_id", business.id).gte("starts_at", from).lt("starts_at", to).order("starts_at"),
      supabase
        .from("appointments")
        .select("*, staff(name)")
        .eq("business_id", business.id)
        .eq("status", "pending")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(20),
    ]);
    const list = (a.data ?? []) as Row[];
    const keys = [...new Set(list.map((r) => phoneKey(r.customer_phone)).filter(Boolean))];
    const [{ data: noteRows }, { data: packageRows }] = keys.length
      ? await Promise.all([
          supabase.from("customer_notes").select("phone_key, note").eq("business_id", business.id).in("phone_key", keys),
          supabase.from("session_packages").select("*").eq("business_id", business.id).in("phone_key", keys).order("created_at"),
        ])
      : [{ data: [] }, { data: [] }];
    setRows(list);
    setNotes(Object.fromEntries((noteRows ?? []).map((n) => [n.phone_key, n.note])));
    setPackages((packageRows ?? []) as SessionPackage[]);
    setPending((p.data ?? []) as Row[]);
    setLoadedAt(Date.now());
  }, [supabase, business.id, day]);

  // Özet: son 14 günün cirosu (bu hafta / geçen hafta), önümüzdeki 7 günün doluluğu, son yorumlar.
  const loadSummary = useCallback(async () => {
    const t = todayStr();
    const [tr, st, rv] = await Promise.all([
      supabase
        .from("appointments")
        .select("starts_at, status, price")
        .eq("business_id", business.id)
        .gte("starts_at", dayBounds(addDays(t, -13)).from)
        .lt("starts_at", dayBounds(t).to),
      supabase
        .from("appointments")
        .select("starts_at")
        .eq("business_id", business.id)
        .neq("status", "cancelled")
        .gte("starts_at", dayBounds(t).from)
        .lt("starts_at", dayBounds(addDays(t, 6)).to),
      supabase.from("reviews").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(3),
    ]);
    setTrend((tr.data ?? []) as Trend[]);
    const counts: Record<string, number> = {};
    for (const r of (st.data ?? []) as { starts_at: string }[]) counts[dayOf(r.starts_at)] = (counts[dayOf(r.starts_at)] ?? 0) + 1;
    setStrip(counts);
    setReviews((rv.data ?? []) as Review[]);
  }, [supabase, business.id]);

  const loadWeek = useCallback(async () => {
    const { data } = await supabase
      .from("appointments")
      .select("*, staff(name)")
      .eq("business_id", business.id)
      .gte("starts_at", dayBounds(weekStart).from)
      .lt("starts_at", dayBounds(addDays(weekStart, 6)).to)
      .order("starts_at");
    setWeekRows((data ?? []) as Row[]);
  }, [supabase, business.id, weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seçili günün randevularını yükle
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- özet bir kez yüklenir
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hafta görünümünde haftayı yükle
    if (view === "hafta") loadWeek();
  }, [view, loadWeek]);

  // Yeni randevu geldiğinde veya değiştiğinde listeyi yenile.
  useEffect(() => {
    const channel = supabase
      .channel(`appointments-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${business.id}` }, () => {
        load();
        loadSummary();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, business.id, load, loadSummary]);

  useEffect(() => {
    Promise.all([
      supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order"),
      supabase.from("staff").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order"),
      supabase.from("working_hours").select("*").eq("business_id", business.id).order("weekday"),
    ]).then(async ([s, st, wh]) => {
      const staffList = (st.data ?? []) as Staff[];
      const { data: ss } = staffList.length ? await supabase.from("staff_services").select("*").in("staff_id", staffList.map((x) => x.id)) : { data: [] };
      setServices((s.data ?? []) as Service[]);
      setStaff(staffList);
      setLinks((ss ?? []) as StaffService[]);
      setHours((wh.data ?? []) as WorkingHour[]);
    });
  }, [supabase, business.id]);

  // Takvimde bir randevuya dokununca liste görünümünde o satıra gidilir.
  useEffect(() => {
    if (view !== "liste" || !focus) return;
    document.getElementById(`randevu-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [view, focus]);

  async function setStatus(id: string, status: AppointmentStatus) {
    setError("");
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) setError(errorMessage(error));
    load();
    loadSummary();
  }

  // Müşteriyi engeller: sayfadan online randevu alamaz, bu işletmedeki yaklaşan randevuları iptal olur.
  async function block(r: Row) {
    if (!confirm(`${r.customer_name} engellensin mi? Online randevu alamaz ve yaklaşan randevuları iptal edilir. Engeli Ayarlar'dan kaldırabilirsiniz.`)) return;
    setError("");
    const { error } = await supabase.rpc("block_customer", { p_appointment_id: r.id });
    if (error) setError(errorMessage(error));
    load();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}/${business.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const active = (rows ?? []).filter((r) => r.status !== "cancelled");
  const revenue = active.filter((r) => r.status !== "no_show").reduce((sum, r) => sum + Number(r.price), 0);
  const done = active.filter((r) => r.status === "completed").length;
  const nextUp = day === today ? active.find((r) => new Date(r.ends_at).getTime() > loadedAt && r.status !== "no_show") : undefined;
  // Bu hafta = son 7 gün (bugün dahil), geçen hafta = ondan önceki 7 gün.
  const cut = dayBounds(addDays(today, -6)).from;
  const thisWeek = earned(trend.filter((r) => r.starts_at >= cut));
  const lastWeek = earned(trend.filter((r) => r.starts_at < cut));
  const dailyRevenue = Array.from({ length: 14 }, (_, i) => earned(trend.filter((r) => dayOf(r.starts_at) === addDays(today, i - 13))));
  const stripDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const stripMax = Math.max(...stripDays.map((d) => strip[d] ?? 0), 1);
  const firstName = account && "name" in account ? account.name.split(" ")[0] : "";

  const checklist = [
    { label: "Logo ekleyin", done: !!business.logo_url, href: "/panel/ayarlar" },
    { label: "Hizmet ekleyin", done: services.length > 0, href: "/panel/hizmetler" },
    { label: "Açıklama yazın", done: !!business.description, href: "/panel/ayarlar" },
    { label: "Konumu kaydedin", done: business.latitude !== null && business.latitude !== undefined, href: "/panel/ayarlar" },
    { label: "Sayfayı yayına alın", done: business.is_published, href: "/panel/ayarlar" },
  ];
  const setupLeft = checklist.filter((c) => !c.done);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Karşılama ve hızlı işler */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-3">{formatDate(today)}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-3xl">
            {loadedAt ? greeting(new Date(loadedAt).getHours()) : "Merhaba"}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={copyLink}>
            {copied ? <CheckCircle2 className="size-4 text-ok" /> : <Copy className="size-4" />} {copied ? "Kopyalandı" : "Randevu linkini kopyala"}
          </button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <CalendarPlus className="size-4" /> Randevu ekle
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Bugünkü randevu" icon={CalendarDays} value={day === today && rows ? String(active.length) : String(strip[today] ?? "–")} hint={day === today ? `${done} tamamlandı` : "bugün için"} />
        <KpiCard label="Bugün beklenen ciro" icon={Wallet} value={day === today ? formatPrice(revenue) : "–"} hint="İptal ve gelmeyenler hariç" />
        <KpiCard label="Onay bekleyen" icon={Clock} value={String(pending.length)} tone={pending.length ? "warn" : undefined} hint={pending.length ? "Aşağıdan onaylayın" : "Hepsi onaylı"} />
        <KpiCard label="Son 7 gün ciro" icon={TrendingUp} value={formatPrice(thisWeek)} cur={thisWeek} prev={lastWeek} spark={dailyRevenue} hint="önceki 7 güne göre" />
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {/* Sıradaki müşteri */}
          {nextUp && (
            <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-gradient-to-br from-brand-500/25 via-brand-500/10 to-transparent p-5 ring-1 ring-brand-400/25">
              <div className="grid w-20 place-items-center rounded-2xl bg-brand-400 py-2 text-brand-950">
                <span className="text-2xs font-semibold uppercase">{untilText(nextUp.starts_at, loadedAt)}</span>
                <span className="text-xl font-bold tabular-nums">{formatTime(nextUp.starts_at)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Sıradaki müşteri</p>
                <p className="truncate text-lg font-semibold">{nextUp.customer_name}</p>
                <p className="truncate text-sm text-ink-2">
                  {nextUp.service_name}
                  {nextUp.staff && ` · ${nextUp.staff.name}`} · {formatPrice(nextUp.price)}
                </p>
              </div>
              <div className="flex gap-2">
                <a href={`tel:${nextUp.customer_phone}`} className="btn btn-secondary py-2">
                  <Phone className="size-4" /> Ara
                </a>
                <button className="btn btn-primary py-2" onClick={() => setStatus(nextUp.id, "completed")}>
                  <CheckCircle2 className="size-4" /> Tamamlandı
                </button>
              </div>
            </section>
          )}

          {/* Onay bekleyenler */}
          {pending.length > 0 && (
            <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
              <h2 className="flex items-center gap-2 font-semibold text-amber-200">
                <Clock className="size-4" /> Onay bekleyen randevular <span className="chip bg-amber-400 px-2 text-amber-950">{pending.length}</span>
              </h2>
              <ul className="mt-3 space-y-2">
                {(allPending ? pending : pending.slice(0, 5)).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 text-sm">
                    <span className="font-medium tabular-nums">
                      {formatDate(r.starts_at, { weekday: undefined })} {formatTime(r.starts_at)}
                    </span>
                    <span className="flex flex-1 flex-wrap items-center gap-2">
                      {r.customer_name} · {r.service_name}
                      {r.customer_flagged && <FlaggedChip row={r} />}
                    </span>
                    <button className="btn btn-primary py-1.5" onClick={() => setStatus(r.id, "confirmed")}>
                      Onayla
                    </button>
                    <button className="btn btn-ghost py-1.5 text-bad" onClick={() => setStatus(r.id, "cancelled")}>
                      Reddet
                    </button>
                    {r.customer_id && (
                      <button className="btn btn-ghost py-1.5 text-bad" onClick={() => block(r)} title="Reddet ve engelle">
                        <Ban className="size-4" /> Engelle
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {pending.length > 5 && (
                <button type="button" onClick={() => setAllPending(!allPending)} className="mt-2 w-full rounded-xl py-2 text-sm font-medium text-amber-200 hover:bg-amber-400/10">
                  {allPending ? "Daha az göster" : `Tümünü göster (${pending.length})`}
                </button>
              )}
            </section>
          )}

          {/* Gün seçici + görünüm */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button className="btn btn-secondary px-2.5" onClick={() => setDay(addDays(day, view === "hafta" ? -7 : -1))} aria-label="Önceki">
                <ChevronLeft className="size-4" />
              </button>
              <input type="date" className="input w-auto py-2" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <button className="btn btn-secondary px-2.5" onClick={() => setDay(addDays(day, view === "hafta" ? 7 : 1))} aria-label="Sonraki">
                <ChevronRight className="size-4" />
              </button>
              {day !== today && (
                <button className="btn btn-ghost" onClick={() => setDay(today)}>
                  Bugün
                </button>
              )}
            </div>
            <div className="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-line" role="tablist" aria-label="Görünüm">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${view === v.id ? "bg-brand-400/15 text-accent" : "text-ink-3 hover:text-ink"}`}
                >
                  <v.icon className="size-3.5" /> {v.label}
                </button>
              ))}
            </div>
          </div>

          <h2 className="text-lg font-semibold">
            {view === "hafta"
              ? `${formatDate(weekStart, { weekday: undefined })} – ${formatDate(addDays(weekStart, 6), { weekday: undefined })}`
              : formatDate(day)}
            {view !== "hafta" && rows && (
              <span className="ml-2 text-sm font-normal text-ink-3">
                {active.length} randevu · {formatPrice(revenue)}
              </span>
            )}
          </h2>

          {view === "takvim" && rows && (
            <DayCalendar
              day={day}
              rows={rows}
              staff={staff}
              hours={hours}
              now={loadedAt}
              onSelect={(id) => {
                setFocus(id);
                setView("liste");
              }}
            />
          )}
          {view === "hafta" && (
            <WeekView
              start={weekStart}
              rows={weekRows}
              onDay={(d) => {
                setDay(d);
                setView("liste");
              }}
            />
          )}

          {view === "liste" &&
            (rows === null ? (
              <div className="card h-32 animate-pulse bg-surface-2" />
            ) : rows.length === 0 ? (
              <div className="card flex flex-col items-center p-10 text-center">
                <CalendarDays className="size-8 text-ink-3" />
                <p className="mt-3 font-medium">Bu gün için randevu yok</p>
                <p className="mt-1 text-sm text-ink-3">Linkinizi paylaşın ya da telefonla gelen randevuyu ekleyin.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button className="btn btn-secondary" onClick={copyLink}>
                    <Copy className="size-4" /> Linki kopyala
                  </button>
                  <button className="btn btn-primary" onClick={() => setAdding(true)}>
                    <CalendarPlus className="size-4" /> Randevu ekle
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    id={`randevu-${r.id}`}
                    className={`card flex flex-wrap items-center gap-4 p-4 transition ${r.status === "cancelled" ? "opacity-60" : ""} ${focus === r.id ? "ring-2 ring-brand-400" : ""}`}
                  >
                    <div className="w-20 text-center">
                      <p className="text-lg font-bold tabular-nums">{formatTime(r.starts_at)}</p>
                      <p className="text-xs tabular-nums text-ink-3">{formatTime(r.ends_at)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {r.customer_name}
                        {r.customer_flagged && <FlaggedChip row={r} />}
                        {!r.customer_id && <span className="chip bg-tint/5 px-2 text-2xs text-ink-3">elle eklendi</span>}
                      </p>
                      <p className="text-sm text-ink-2">
                        {r.service_name}
                        {r.staff && ` · ${r.staff.name}`} · {formatPrice(r.price)}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-x-4 text-sm">
                        <a href={`tel:${r.customer_phone}`} className="inline-flex items-center gap-1 text-accent">
                          <Phone className="size-3.5" /> {r.customer_phone}
                        </a>
                        {["pending", "confirmed"].includes(r.status) && (
                          <a href={whatsappLink(r.customer_phone, reminderText(r, business.name))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ok">
                            <MessageCircle className="size-3.5" /> WhatsApp ile hatırlat
                          </a>
                        )}
                        {["pending", "confirmed"].includes(r.status) && r.service_id && new Date(r.starts_at).getTime() > loadedAt && (
                          <button onClick={() => setMoving(r)} className="inline-flex items-center gap-1 text-accent">
                            <CalendarClock className="size-3.5" /> Saati değiştir
                          </button>
                        )}
                        {r.customer_id && (
                          <button onClick={() => block(r)} className="inline-flex items-center gap-1 text-bad">
                            <Ban className="size-3.5" /> Engelle
                          </button>
                        )}
                      </div>
                      {r.note && <p className="mt-1 text-sm italic text-ink-3">“{r.note}”</p>}
                      <PackageChip row={r} packages={packages} />
                      {notes[phoneKey(r.customer_phone)] && (
                        <p className="mt-1 flex items-start gap-1.5 whitespace-pre-line text-sm text-amber-200/90" title="Müşteri notunuz">
                          <StickyNote className="mt-0.5 size-3.5 shrink-0" /> {notes[phoneKey(r.customer_phone)]}
                        </p>
                      )}
                    </div>
                    <select
                      value={r.status}
                      onChange={(e) => setStatus(r.id, e.target.value as AppointmentStatus)}
                      className={`chip cursor-pointer border-0 py-1.5 pr-7 text-sm ${STATUS[r.status].className}`}
                    >
                      {Object.entries(STATUS).map(([value, s]) => (
                        <option key={value} value={value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            ))}
        </div>

        {/* Yan sütun: önümüzdeki 7 gün, kurulum, son yorumlar */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-accent" /> Önümüzdeki 7 gün
            </h2>
            <ul className="mt-3 space-y-1">
              {stripDays.map((d) => {
                const n = strip[d] ?? 0;
                return (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => {
                        setDay(d);
                        if (view === "hafta") setView("liste");
                      }}
                      className={`grid w-full grid-cols-[5.5rem_1fr_2rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-tint/[0.04] ${d === day ? "bg-brand-400/10" : ""}`}
                    >
                      <span className={d === today ? "font-semibold text-accent" : "text-ink-2"}>
                        {d === today ? "Bugün" : formatDate(d, { weekday: "short", day: undefined, month: undefined })}
                        <span className="ml-1 text-ink-3">{formatDate(d, { weekday: undefined, month: undefined })}</span>
                      </span>
                      <span className="h-2 rounded-full bg-surface-2">
                        <span className="block h-2 rounded-full bg-brand-500" style={{ width: `${(n / stripMax) * 100}%` }} />
                      </span>
                      <span className="text-right font-medium tabular-nums">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {setupLeft.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-semibold">Sayfanızı tamamlayın</h2>
              <p className="mt-0.5 text-xs text-ink-3">Eksiksiz sayfalar daha çok randevu alır.</p>
              <div className="mt-3 h-1.5 rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full bg-brand-400" style={{ width: `${((checklist.length - setupLeft.length) / checklist.length) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {checklist.map((c) => (
                  <li key={c.label}>
                    <Link href={c.href} className={`flex items-center gap-2 ${c.done ? "text-ink-3 line-through" : "text-ink-2 hover:text-ink"}`}>
                      {c.done ? <CheckCircle2 className="size-4 text-ok" /> : <Circle className="size-4 text-ink-3" />} {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Star className="size-4 fill-amber-400 text-amber-400" /> Son yorumlar
              </h2>
              <Link href="/panel/yorumlar" className="text-xs text-accent hover:underline">
                Tümü
              </Link>
            </div>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">Henüz yorum yok. Tamamlanan randevulardan sonra müşterilere değerlendirme isteği gider.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.customer_name}</span>
                      <span className="flex shrink-0">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className={`size-3 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
                        ))}
                      </span>
                    </div>
                    {r.comment && <p className="mt-0.5 line-clamp-2 text-ink-3">{r.comment}</p>}
                    {!r.reply && <p className="mt-0.5 text-2xs font-medium text-warn">Cevap bekliyor</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link href="/panel/musteriler" className="card flex items-center gap-3 p-4 text-sm transition hover:ring-line-strong">
            <Users className="size-4 text-accent" />
            <span className="flex-1">Müşteri defteri ve notlar</span>
            <ChevronRight className="size-4 text-ink-3" />
          </Link>
        </aside>
      </div>

      {moving && (
        <RescheduleDialog
          appointment={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            load();
          }}
        />
      )}

      {adding && (
        <AddAppointment
          businessId={business.id}
          day={day}
          services={services}
          staff={staff}
          links={links}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
            loadSummary();
          }}
        />
      )}
    </div>
  );
}

/** Sık iptal eden / gelmeyen müşteri: randevu alındığı andaki son 6 aylık geçmiş (tüm işletmelerde). */
function FlaggedChip({ row }: { row: Row }) {
  return (
    <span
      className="chip bg-rose-400/10 text-xs font-medium text-bad ring-1 ring-rose-400/20"
      title="Randevu alındığında müşterinin son 6 aydaki geçmişi (tüm SiftahGo işletmelerinde)"
    >
      <AlertTriangle className="size-3.5" /> Sık iptal · {row.prior_cancels} iptal, {row.prior_no_shows} gelmedi
    </span>
  );
}

/** Randevunun düştüğü veya düşeceği seans paketi: "Lazer paketi · 7/10 seans kaldı" */
function PackageChip({ row, packages }: { row: Row; packages: SessionPackage[] }) {
  const pkg =
    packages.find((p) => p.id === row.package_id) ??
    (row.status === "cancelled"
      ? undefined
      : packages.find((p) => p.phone_key === phoneKey(row.customer_phone) && p.service_id === row.service_id && p.used < p.total));
  if (!pkg) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-sm text-accent">
      <Package className="size-3.5 shrink-0" />
      {pkg.name} · {pkg.total - pkg.used}/{pkg.total} seans kaldı{row.package_id === pkg.id ? " · bu randevu düşüldü" : ""}
    </p>
  );
}

function AddAppointment(props: {
  businessId: string;
  day: string;
  services: Service[];
  staff: Staff[];
  links: StaffService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    service_id: props.services[0]?.id ?? "",
    staff_id:
      props.staff.find(
        (p) =>
          !props.links.some((l) => l.staff_id === p.id) ||
          props.links.some((l) => l.staff_id === p.id && l.service_id === props.services[0]?.id),
      )?.id ?? "",
    day: props.day,
    time: "10:00",
    customer_name: "",
    customer_phone: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  // Seçili hizmeti verebilen personel (kaydı olmayan herkesi verebilir).
  const allowedStaff = (serviceId: string) =>
    props.staff.filter(
      (p) => !props.links.some((l) => l.staff_id === p.id) || props.links.some((l) => l.staff_id === p.id && l.service_id === serviceId),
    );
  const staffOptions = allowedStaff(form.service_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const service = props.services.find((s) => s.id === form.service_id);
    if (!service) return setError("Önce Hizmetler sayfasından bir hizmet ekleyin.");
    setBusy(true);
    const starts = toIso(form.day, form.time);
    const { error } = await createClient().from("appointments").insert({
      business_id: props.businessId,
      service_id: service.id,
      staff_id: form.staff_id || null,
      service_name: service.name,
      price: service.price,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      note: form.note.trim(),
      starts_at: starts,
      ends_at: new Date(new Date(starts).getTime() + service.duration_minutes * 60000).toISOString(),
      status: "confirmed",
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    props.onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center" onClick={props.onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Randevu ekle</h2>
          <button type="button" onClick={props.onClose} className="btn btn-ghost px-2" aria-label="Kapat">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-3">Telefonla veya dükkânda alınan randevuları buraya girin.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Hizmet</label>
            <select
              required
              className="input"
              value={form.service_id}
              onChange={(e) => {
                const allowed = allowedStaff(e.target.value);
                setForm({
                  ...form,
                  service_id: e.target.value,
                  staff_id: allowed.some((p) => p.id === form.staff_id) ? form.staff_id : allowed[0]?.id ?? "",
                });
              }}
            >
              {props.services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} dk)</option>)}
            </select>
          </div>
          {staffOptions.length > 1 && (
            <div className="sm:col-span-2">
              <label className="label">Personel</label>
              <select className="input" value={form.staff_id} onChange={set("staff_id")}>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Tarih</label>
            <input type="date" required className="input" value={form.day} onChange={set("day")} />
          </div>
          <div>
            <label className="label">Saat</label>
            <input type="time" required className="input" value={form.time} onChange={set("time")} />
          </div>
          <div>
            <label className="label">Müşteri adı</label>
            <input required className="input" value={form.customer_name} onChange={set("customer_name")} />
          </div>
          <div>
            <label className="label">Telefon</label>
            <input required type="tel" className="input" value={form.customer_phone} onChange={set("customer_phone")} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Not</label>
            <input className="input" value={form.note} onChange={set("note")} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <button disabled={busy} className="btn btn-primary mt-5 w-full py-3">
          {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
        </button>
      </form>
    </div>
  );
}
