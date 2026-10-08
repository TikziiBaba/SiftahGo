"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";
import { STATUS } from "@/lib/constants";
import {
  addDays,
  dayBounds,
  errorMessage,
  formatDate,
  formatPrice,
  formatTime,
  reminderText,
  toIso,
  todayStr,
  whatsappLink,
} from "@/lib/format";
import type { Appointment, AppointmentStatus, Service, Staff, StaffService } from "@/lib/types";

type Row = Appointment & { staff: { name: string } | null };

export default function AppointmentsPage() {
  const { business } = useBusiness();
  const supabase = createClient();
  const [day, setDay] = useState(todayStr);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<Row[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [links, setLinks] = useState<StaffService[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { from, to } = dayBounds(day);
    const [a, p] = await Promise.all([
      supabase.from("appointments").select("*, staff(name)").eq("business_id", business.id)
        .gte("starts_at", from).lt("starts_at", to).order("starts_at"),
      supabase.from("appointments").select("*, staff(name)").eq("business_id", business.id)
        .eq("status", "pending").gte("starts_at", new Date().toISOString()).order("starts_at").limit(20),
    ]);
    setRows((a.data ?? []) as Row[]);
    setPending((p.data ?? []) as Row[]);
  }, [supabase, business.id, day]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seçili günün randevularını yükle
    load();
  }, [load]);

  // Yeni randevu geldiğinde veya değiştiğinde listeyi yenile.
  useEffect(() => {
    const channel = supabase
      .channel(`appointments-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${business.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, business.id, load]);

  useEffect(() => {
    Promise.all([
      supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order"),
      supabase.from("staff").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order"),
    ]).then(async ([s, st]) => {
      const staffList = (st.data ?? []) as Staff[];
      const { data: ss } = staffList.length
        ? await supabase.from("staff_services").select("*").in("staff_id", staffList.map((x) => x.id))
        : { data: [] };
      setServices((s.data ?? []) as Service[]);
      setStaff(staffList);
      setLinks((ss ?? []) as StaffService[]);
    });
  }, [supabase, business.id]);

  async function setStatus(id: string, status: AppointmentStatus) {
    setError("");
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) setError(errorMessage(error));
    load();
  }

  const active = (rows ?? []).filter((r) => r.status !== "cancelled");
  const revenue = active.filter((r) => r.status !== "no_show").reduce((sum, r) => sum + Number(r.price), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button className="btn btn-secondary px-2.5" onClick={() => setDay(addDays(day, -1))} aria-label="Önceki gün">
            <ChevronLeft className="size-4" />
          </button>
          <input type="date" className="input w-auto py-2" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button className="btn btn-secondary px-2.5" onClick={() => setDay(addDays(day, 1))} aria-label="Sonraki gün">
            <ChevronRight className="size-4" />
          </button>
          {day !== todayStr() && (
            <button className="btn btn-ghost" onClick={() => setDay(todayStr())}>Bugün</button>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <CalendarPlus className="size-4" /> Randevu Ekle
        </button>
      </div>

      <h1 className="mt-6 text-xl font-bold">{formatDate(day)}</h1>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Randevu" value={String(active.length)} />
        <Stat label="Beklenen ciro" value={formatPrice(revenue)} />
        <Stat label="Onay bekleyen" value={String(pending.length)} />
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {pending.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <h2 className="font-semibold text-amber-200">Onay bekleyen randevular</h2>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 text-sm">
                <span className="font-medium">{formatDate(r.starts_at, { weekday: undefined })} {formatTime(r.starts_at)}</span>
                <span className="flex-1">{r.customer_name} · {r.service_name}</span>
                <button className="btn btn-primary py-1.5" onClick={() => setStatus(r.id, "confirmed")}>Onayla</button>
                <button className="btn btn-ghost py-1.5 text-rose-400" onClick={() => setStatus(r.id, "cancelled")}>Reddet</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        {rows === null ? (
          <div className="card h-32 animate-pulse bg-surface-2" />
        ) : rows.length === 0 ? (
          <div className="card p-10 text-center text-ink-3">Bu gün için randevu yok.</div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className={`card flex flex-wrap items-center gap-4 p-4 ${r.status === "cancelled" ? "opacity-60" : ""}`}>
                <div className="w-20 text-center">
                  <p className="text-lg font-bold">{formatTime(r.starts_at)}</p>
                  <p className="text-xs text-ink-3">{formatTime(r.ends_at)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.customer_name}</p>
                  <p className="text-sm text-ink-2">
                    {r.service_name}
                    {r.staff && ` · ${r.staff.name}`} · {formatPrice(r.price)}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-sm">
                    <a href={`tel:${r.customer_phone}`} className="inline-flex items-center gap-1 text-brand-300">
                      <Phone className="size-3.5" /> {r.customer_phone}
                    </a>
                    {["pending", "confirmed"].includes(r.status) && (
                      <a
                        href={whatsappLink(r.customer_phone, reminderText(r, business.name))}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400"
                      >
                        <MessageCircle className="size-3.5" /> WhatsApp ile hatırlat
                      </a>
                    )}
                  </div>
                  {r.note && <p className="mt-1 text-sm italic text-ink-3">“{r.note}”</p>}
                </div>
                <select
                  value={r.status}
                  onChange={(e) => setStatus(r.id, e.target.value as AppointmentStatus)}
                  className={`chip cursor-pointer border-0 py-1.5 pr-7 text-sm ${STATUS[r.status].className}`}
                >
                  {Object.entries(STATUS).map(([value, s]) => (
                    <option key={value} value={value}>{s.label}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>

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
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-lg font-bold md:text-xl">{value}</p>
    </div>
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
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button disabled={busy} className="btn btn-primary mt-5 w-full py-3">
          {busy && <Loader2 className="size-4 animate-spin" />} Kaydet
        </button>
      </form>
    </div>
  );
}
