"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarPlus, CheckCircle2, ChevronLeft, Loader2 } from "lucide-react";
import { PhoneVerify } from "@/components/phone-verify";
import { bookableDays, DayStrip, SlotGrid } from "@/components/slot-picker";
import { createClient } from "@/lib/supabase/client";
import {
  errorMessage,
  formatDate,
  formatDuration,
  formatPrice,
  formatTime,
  googleCalendarLink,
  todayStr,
} from "@/lib/format";
import type { AppSettings, Business, Service, Staff, StaffService, WorkingHour } from "@/lib/types";

type Props = { business: Business; services: Service[]; staff: Staff[]; staffServices: StaffService[]; hours: WorkingHour[] };

export function BookingWidget({ business, services, staff: allStaff, staffServices, hours }: Props) {
  const supabase = createClient();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const days = useMemo(() => bookableDays(business.booking_days, hours), [business.booking_days, hours]);
  // Bugün kapalıysa ilk açık gün seçili gelir.
  const [day, setDay] = useState(() => days.find((d) => d.open)?.day ?? todayStr());
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  // null: oturum henüz bilinmiyor. Randevu için giriş zorunlu.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // WhatsApp ile doğrulanmış numara; doğrulama açıksa randevuya bu yazılır.
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Alınan randevunun durumu; sık iptal eden müşteride işletme ayarından bağımsız "pending" olur.
  const [booked, setBooked] = useState<"pending" | "confirmed" | null>(null);
  const [reload, setReload] = useState(0);

  const service = services.find((s) => s.id === serviceId);
  // Kaydı olmayan personel tüm hizmetleri verir.
  const staff = allStaff.filter(
    (p) => !staffServices.some((l) => l.staff_id === p.id) || staffServices.some((l) => l.staff_id === p.id && l.service_id === serviceId),
  );
  const slotKey = `${serviceId}|${staffId}|${day}|${reload}`;
  const times = slotResult?.key === slotKey ? slotResult.times : null;


  useEffect(() => {
    supabase
      .from("app_settings")
      .select("phone_verification, whatsapp_number")
      .maybeSingle()
      .then(({ data }) => setSettings(data));
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setLoggedIn(false);
      setLoggedIn(true);
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", data.user.id).maybeSingle(),
        supabase.from("phone_verifications").select("phone, verified_at").maybeSingle(),
      ]);
      if (p) setForm((f) => ({ ...f, name: f.name || p.full_name, phone: f.phone || p.phone || "" }));
      if (v?.verified_at && v.phone) setVerifiedPhone(v.phone);
    });
  }, [supabase]);

  const onVerified = useCallback((phone: string) => {
    setVerifiedPhone(phone);
    setError("");
  }, []);
  const needsVerification = !!settings?.phone_verification && !verifiedPhone;

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
      p_customer_phone: settings?.phone_verification && verifiedPhone ? verifiedPhone : form.phone,
      p_note: form.note,
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
      <section className="card p-8 text-center">
        <CheckCircle2 className="mx-auto size-14 text-emerald-400" />
        <h2 className="mt-4 text-xl font-bold">Randevunuz alındı!</h2>
        <p className="mt-2 text-ink-2">
          {formatDate(time)} saat <b>{formatTime(time)}</b> · {service.name}
        </p>
        <p className="mt-1 text-sm text-ink-3">
          {booked === "confirmed" ? "Randevunuz onaylandı." : "İşletme randevunuzu onayladığında kesinleşecek."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={googleCalendarLink(
              `${business.name} — ${service.name}`,
              time,
              new Date(new Date(time).getTime() + service.duration_minutes * 60000).toISOString(),
              [business.address, business.district, business.city].filter(Boolean).join(", "),
            )}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            <CalendarPlus className="size-4" /> Takvime ekle
          </a>
          <Link href="/hesabim" className="btn btn-primary">Randevularım</Link>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setBooked(null);
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
                  p.id === staffId ? "border-brand-400 bg-brand-700 text-white" : "border-line-strong hover:bg-white/5"
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Adınız Soyadınız</label>
              <input id="name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Telefon</label>
              {settings?.phone_verification ? (
                verifiedPhone ? (
                  <p id="phone" className="input flex items-center gap-2 text-ink-2">
                    {verifiedPhone} <BadgeCheck className="size-4 text-emerald-400" aria-label="Doğrulandı" />
                  </p>
                ) : (
                  <p id="phone" className="input text-ink-3">Aşağıdan doğrulayın</p>
                )
              ) : (
                <input
                  id="phone"
                  required
                  type="tel"
                  placeholder="05xx xxx xx xx"
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              )}
            </div>
            {needsVerification && settings && (
              <div className="sm:col-span-2">
                <PhoneVerify whatsappNumber={settings.whatsapp_number} onVerified={onVerified} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="note">Not (isteğe bağlı)</label>
              <textarea id="note" rows={2} maxLength={500} className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
          <button disabled={busy || needsVerification} className="btn btn-primary mt-4 w-full py-3 text-base">
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
        <span className="grid size-6 place-items-center rounded-full bg-brand-400/15 text-xs text-brand-300">{n}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
