"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BellRing, ChevronLeft, Loader2 } from "lucide-react";
import { AddToCalendar } from "@/components/add-to-calendar";
import { AppointmentTicket } from "@/components/appointment-ticket";
import { bookableDays, DayStrip, SlotGrid } from "@/components/slot-picker";
import { couponFits, couponPrice, formatDiscount, formatMoney } from "@/lib/coupons";
import { createClient } from "@/lib/supabase/client";
import { useShopCoupons } from "@/lib/use-shop-coupons";
import {
  errorMessage,
  formatDate,
  formatDuration,
  formatPrice,
  formatTime,
  todayStr,
} from "@/lib/format";
import type { Business, Service, Staff, StaffService, WorkingHour } from "@/lib/types";

// Yalnızca gereken alanlar: işletme satırının tamamı (sahip kimliği, davet kodu vb.) tarayıcıya gönderilmez.
export type BookingBusiness = Pick<Business, "id" | "slug" | "name" | "address" | "district" | "city" | "booking_days" | "auto_confirm">;

type Props = { business: BookingBusiness; services: Service[]; staff: Staff[]; staffServices: StaffService[]; hours: WorkingHour[]; couponsEnabled?: boolean };

export function BookingWidget({ business, services, staff: allStaff, staffServices, hours, couponsEnabled = false }: Props) {
  const supabase = createClient();
  const params = useSearchParams();
  // "Tekrar al" (?hizmet=..&personel=..): önceki randevunun hizmeti ve personeli seçili gelir; artık yoksa seçilmez.
  const [serviceId, setServiceId] = useState<string | null>(() => {
    const id = params.get("hizmet");
    return services.some((s) => s.id === id) ? id : null;
  });
  const [staffId, setStaffId] = useState(() => {
    const id = params.get("personel") ?? "";
    const offers = (p: Staff) =>
      !staffServices.some((l) => l.staff_id === p.id) || staffServices.some((l) => l.staff_id === p.id && l.service_id === params.get("hizmet"));
    return allStaff.some((p) => p.id === id && offers(p)) ? id : "";
  });
  const days = useMemo(() => bookableDays(business.booking_days, hours), [business.booking_days, hours]);
  // ?gun= (bekleme listesi haberi) açık bir günse o gün, değilse ilk açık gün seçili gelir.
  const [day, setDay] = useState(
    () => days.find((d) => d.open && d.day === params.get("gun"))?.day ?? days.find((d) => d.open)?.day ?? todayStr(),
  );
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  // null: oturum henüz bilinmiyor. Randevu için giriş zorunlu.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Alınan randevunun durumu; sık iptal eden müşteride işletme ayarından bağımsız "pending" olur.
  const [booked, setBooked] = useState<"pending" | "confirmed" | null>(null);
  // Sunucunun hesapladığı ödenecek tutar (kuponluysa indirimli)
  const [bookedPrice, setBookedPrice] = useState<number | null>(null);
  const [couponId, setCouponId] = useState("");
  const { coupons, claims, refresh: refreshCoupons } = useShopCoupons(business.id, couponsEnabled);
  const [reload, setReload] = useState(0);
  // Bekleme listesine yazıldığı günler (giriş yapmışsa)
  const [waitDays, setWaitDays] = useState<string[]>([]);
  const [waitBusy, setWaitBusy] = useState(false);
  const [waitError, setWaitError] = useState("");
  // Bu işletmeden daha önce alınan hizmetler (giriş yapmışsa): en yeni randevu önce
  const [past, setPast] = useState<{ service_id: string; staff_id: string | null; starts_at: string }[]>([]);

  const service = services.find((s) => s.id === serviceId);
  // Hizmet başına en son randevu; artık sunulmayan hizmet gösterilmez.
  const previous = past.flatMap((v, i) => {
    const s = services.find((x) => x.id === v.service_id);
    return s && past.findIndex((o) => o.service_id === v.service_id) === i ? [{ ...v, service: s }] : [];
  });
  // Kaydı olmayan personel tüm hizmetleri verir.
  const staff = allStaff.filter(
    (p) => !staffServices.some((l) => l.staff_id === p.id) || staffServices.some((l) => l.staff_id === p.id && l.service_id === serviceId),
  );
  const slotKey = `${serviceId}|${staffId}|${day}|${reload}`;
  const times = slotResult?.key === slotKey ? slotResult.times : null;
  // Seçilen hizmet ve saate uyan kuponlar (gösterim için; asıl denetim sunucuda). Kullanılmış ya da başka randevuya
  // bağlı kod, hakkı biten kupon ve fiyatsız hizmet sunulmaz.
  // Durdurulmuş kuponu önceden alan müşterinin kodu hâlâ geçerli: açık kuponlara alınmış (active) kodlar da eklenir.
  const candidates = [
    ...coupons,
    ...claims.filter((x) => x.state === "active" && !coupons.some((c) => c.id === x.coupon_id)).map((x) => ({ ...x, id: x.coupon_id })),
  ];
  const offers =
    service && time && loggedIn && Number(service.price) > 0
      ? candidates.filter((c) => {
          if (!couponFits(c, service.id, time)) return false;
          const mine = claims.find((x) => x.coupon_id === c.id);
          if (mine) return mine.state === "active";
          return "total_limit" in c && (c.total_limit === null || c.claimed_count < c.total_limit);
        })
      : [];
  const chosen = offers.find((c) => c.id === couponId);

  useEffect(() => {
    // Yerel oturum yeterli (Auth sunucusuna gidilmez); veriyi RLS korur.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return setLoggedIn(false);
      setLoggedIn(true);
      const [{ data: waits }, { data: p }, { data: visits }] = await Promise.all([
        supabase.from("waitlist").select("day").eq("business_id", business.id),
        supabase.from("profiles").select("full_name, phone").eq("id", session.user.id).maybeSingle(),
        supabase
          .from("appointments")
          .select("service_id, staff_id, starts_at")
          .eq("business_id", business.id)
          .eq("customer_id", session.user.id)
          .in("status", ["completed", "confirmed"])
          .lt("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: false })
          .limit(30),
      ]);
      setPast((visits ?? []) as typeof past);
      setWaitDays((waits ?? []).map((w: { day: string }) => w.day));
      if (p) setForm((f) => ({ ...f, name: f.name || p.full_name, phone: f.phone || p.phone || "" }));
    });
  }, [supabase, business.id]);

  useEffect(() => {
    if (!serviceId) return;
    let active = true;
    const key = `${serviceId}|${staffId}|${day}|${reload}`;
    supabase
      .rpc("get_available_slots", {
        p_business_id: business.id,
        p_service_id: serviceId,
        p_day: day,
        p_staff_id: staffId || null,
      })
      .then(({ data }) => {
        if (!active) return;
        const unique = [...new Set(((data ?? []) as { slot_start: string }[]).map((s) => s.slot_start))];
        setSlotResult({ key, times: unique });
      });
    return () => {
      active = false;
    };
  }, [supabase, business.id, serviceId, staffId, day, reload]);

  async function joinWaitlist() {
    setWaitBusy(true);
    setWaitError("");
    const { error } = await supabase.rpc("join_waitlist", { p_business_id: business.id, p_day: day });
    setWaitBusy(false);
    if (error) return setWaitError(errorMessage(error));
    setWaitDays((d) => [...d, day]);
  }

  async function leaveWaitlist() {
    setWaitBusy(true);
    setWaitError("");
    const { error } = await supabase.from("waitlist").delete().eq("business_id", business.id).eq("day", day);
    setWaitBusy(false);
    if (error) return setWaitError(errorMessage(error));
    setWaitDays((d) => d.filter((x) => x !== day));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !time) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("book_appointment", {
      p_business_id: business.id,
      p_service_id: service.id,
      p_staff_id: staffId || null,
      p_starts_at: time,
      p_customer_name: form.name,
      p_customer_phone: form.phone,
      p_note: form.note,
      ...(chosen && { p_coupon_id: chosen.id }),
    });
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      if (error.message.includes("müsait değil")) {
        setTime(null);
        setReload((r) => r + 1);
      }
      return;
    }
    posthog.capture("randevu_alindi", { isletme: business.slug, hizmet: service.name });
    setBookedPrice(Number((data as { price?: number } | null)?.price ?? service.price));
    if (chosen) refreshCoupons();
    setBooked((data as { status: "pending" | "confirmed" } | null)?.status ?? (business.auto_confirm ? "confirmed" : "pending"));
  }

  if (services.length === 0) {
    return (
      <section className="card p-8 text-center text-ink-3">
        Bu işletme henüz online randevuya hizmet eklememiş.
      </section>
    );
  }

  if (booked && service && time) {
    return (
      <section className="py-2 text-center">
        <AppointmentTicket
          businessName={business.name}
          serviceName={service.name}
          staffName={allStaff.find((p) => p.id === staffId)?.name}
          startsAt={time}
          durationMinutes={service.duration_minutes}
          price={bookedPrice ?? Number(service.price)}
          place={[business.address, business.district, business.city].filter(Boolean).join(", ")}
          confirmed={booked === "confirmed"}
        />
        <p className="mt-5 text-sm text-ink-3">
          {booked === "confirmed" ? "Randevunuz onaylandı." : "İşletme randevunuzu onayladığında kesinleşecek."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <AddToCalendar
            title={`${business.name} — ${service.name}`}
            startsAt={time}
            endsAt={new Date(new Date(time).getTime() + service.duration_minutes * 60000).toISOString()}
            location={[business.name, business.address, business.district, business.city].filter(Boolean).join(", ")}
            className="btn btn-secondary"
          />
          <Link href="/hesabim" className="btn btn-primary">Randevularım</Link>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setBooked(null);
              setBookedPrice(null);
              setCouponId("");
              setTime(null);
              setReload((r) => r + 1);
            }}
          >
            Yeni randevu
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5 md:p-6">
      <h2 className="text-lg font-semibold">Randevu al</h2>

      <Step n={1} title="Hizmet seçin">
        {previous.length > 0 && (
          <div className="mb-4 rounded-xl bg-brand-400/5 p-3 ring-1 ring-brand-400/20">
            <p className="text-sm font-medium">Daha önce aldıklarınız</p>
            <ul className="mt-2 grid gap-2">
              {previous.map((v) => (
                <li key={v.service_id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{v.service.name}</span>
                    <span className="text-ink-3">Son randevu: {formatDate(v.starts_at)}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    onClick={() => {
                      setServiceId(v.service.id);
                      const offers = !staffServices.some((l) => l.staff_id === v.staff_id) || staffServices.some((l) => l.staff_id === v.staff_id && l.service_id === v.service.id);
                      setStaffId(v.staff_id && offers && allStaff.some((p) => p.id === v.staff_id) ? v.staff_id : "");
                      setTime(null);
                    }}
                  >
                    Tekrar al
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="grid gap-2">
          {services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  setStaffId("");
                  setTime(null);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition ${
                  s.id === serviceId ? "border-brand-400 bg-brand-400/10 ring-2 ring-brand-400/20" : "border-line hover:border-line-strong"
                }`}
              >
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="text-sm text-ink-3">
                    {formatDuration(s.duration_minutes)}
                    {s.description && ` · ${s.description}`}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">{Number(s.price) > 0 ? formatPrice(s.price) : "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      </Step>

      {service && staff.length > 1 && (
        <Step n={2} title="Personel seçin">
          <div className="flex flex-wrap gap-2">
            {[{ id: "", name: "Farketmez" }, ...staff].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setStaffId(p.id);
                  setTime(null);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  p.id === staffId ? "border-brand-400 bg-brand-700 text-white" : "border-line-strong hover:bg-tint/5"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </Step>
      )}

      {service && (
        <Step n={staff.length > 1 ? 3 : 2} title="Gün ve saat seçin">
          <DayStrip
            days={days}
            value={day}
            onChange={(d) => {
              setDay(d);
              setTime(null);
            }}
          />

          <div className="mt-3">
            <SlotGrid times={times} value={time} onChange={setTime} />
          </div>

          {times?.length === 0 && (
            <div className="mt-3 rounded-xl border border-line p-4 text-sm">
              {waitDays.includes(day) ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-accent">
                    <BellRing className="size-4" /> Bu günde saat boşalırsa size haber vereceğiz.
                  </p>
                  <button type="button" disabled={waitBusy} onClick={leaveWaitlist} className="btn btn-ghost py-1.5">
                    Vazgeç
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-ink-2">Bir randevu iptal edilirse haber verelim mi? İlk alan kapar.</p>
                  {loggedIn === false ? (
                    <Link href={`/giris?next=/${business.slug}`} className="btn btn-secondary py-1.5">
                      <BellRing className="size-4" /> Giriş yapıp haber al
                    </Link>
                  ) : (
                    <button type="button" disabled={waitBusy || loggedIn === null} onClick={joinWaitlist} className="btn btn-secondary py-1.5">
                      {waitBusy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />} Boşalırsa haber ver
                    </button>
                  )}
                </div>
              )}
              {waitError && <p className="mt-2 text-bad">{waitError}</p>}
            </div>
          )}
        </Step>
      )}

      {service && time && loggedIn === false && (
        <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-center md:p-5">
          <button type="button" onClick={() => setTime(null)} className="mb-3 flex items-center gap-1 text-sm text-ink-3">
            <ChevronLeft className="size-4" /> Saati değiştir
          </button>
          <p className="font-medium">
            {formatDate(time)}, {formatTime(time)} · {service.name}
          </p>
          <p className="mt-2 text-sm text-ink-3">
            Randevuyu tamamlamak için giriş yapın. Hesabınızla randevularınızı takip eder, gerekirse erteler veya iptal edersiniz.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href={`/giris?next=/${business.slug}`} className="btn btn-primary">Giriş yap</Link>
            <Link href={`/kayit?next=/${business.slug}`} className="btn btn-secondary">Hesap aç</Link>
          </div>
        </div>
      )}

      {service && time && loggedIn && (
        <form onSubmit={submit} className="mt-6 rounded-2xl bg-surface-2 p-4 md:p-5">
          <button type="button" onClick={() => setTime(null)} className="mb-3 flex items-center gap-1 text-sm text-ink-3">
            <ChevronLeft className="size-4" /> Saati değiştir
          </button>
          <p className="font-medium">
            {formatDate(time)}, {formatTime(time)} · {service.name}
          </p>
          {offers.length > 0 && (
            <fieldset className="mt-4">
              <legend className="label">Kupon</legend>
              <div className="grid gap-2">
                {[null, ...offers].map((c) => (
                  <label
                    key={c?.id ?? ""}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${
                      (c?.id ?? "") === (chosen?.id ?? "") ? "border-brand-400 bg-brand-400/10" : "border-line"
                    }`}
                  >
                    <input type="radio" name="coupon" checked={(c?.id ?? "") === (chosen?.id ?? "")} onChange={() => setCouponId(c?.id ?? "")} />
                    <span>{c ? `${c.title} · ${formatDiscount(c)}` : "Kuponsuz"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {chosen && service && (
            <p className="mt-3 text-sm">
              Ödenecek tutar:{" "}
              <span className="text-ink-3 line-through">{formatMoney(Number(service.price))}</span>{" "}
              <span className="font-semibold">{formatMoney(couponPrice(Number(service.price), chosen))}</span>
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Adınız Soyadınız</label>
              <input id="name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Telefon</label>
              <input
                id="phone"
                required
                type="tel"
                placeholder="05xx xxx xx xx"
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="note">Not (isteğe bağlı)</label>
              <textarea id="note" rows={2} maxLength={500} className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}
          <button disabled={busy} className="btn btn-primary mt-4 w-full py-3 text-base">
            {busy && <Loader2 className="size-4 animate-spin" />} Randevuyu Onayla
          </button>
          <p className="mt-3 text-center text-xs text-ink-3">
            Randevu bilgileriniz işletmeye iletilir; kişisel verileriniz{" "}
            <Link href="/yasal/gizlilik" className="underline">Gizlilik ve KVKK metnine</Link> göre işlenir.
          </p>
        </form>
      )}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-2">
        <span className="grid size-6 place-items-center rounded-full bg-brand-400/15 text-xs text-accent">{n}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
