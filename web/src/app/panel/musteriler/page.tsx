"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Package, Phone, Search, StickyNote } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { SessionPackages } from "@/components/session-packages";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatDate, formatPrice, formatTime, phoneKey, whatsappLink } from "@/lib/format";
import type { Service, SessionPackage } from "@/lib/types";

type Customer = {
  phone: string;
  name: string;
  total: number;
  completed: number;
  no_show: number;
  cancelled: number;
  spent: number;
  last_visit: string | null;
  next_appointment: string | null;
};

export default function CustomersPage() {
  return (
    <PlanGate feature="customers" title="Müşteri defteri">
      <Customers />
    </PlanGate>
  );
}

function Customers() {
  const { business } = useBusiness();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  // Telefonun son 10 hanesi -> not
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  // Paket eklenen müşterinin telefon anahtarı
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.rpc("get_customers", { p_business_id: business.id }),
      supabase.from("customer_notes").select("phone_key, note").eq("business_id", business.id),
      supabase.from("session_packages").select("*").eq("business_id", business.id).order("created_at"),
      supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order"),
    ]).then(([{ data, error }, { data: noteRows }, { data: packageRows }, { data: serviceRows }]) => {
      if (error) setError(errorMessage(error));
      setCustomers((data ?? []) as Customer[]);
      setNotes(Object.fromEntries((noteRows ?? []).map((n) => [n.phone_key, n.note])));
      setPackages((packageRows ?? []) as SessionPackage[]);
      setServices((serviceRows ?? []) as Service[]);
    });
  }, [business.id]);

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const text = editing.text.trim();
    const { error } = text
      ? await supabase
          .from("customer_notes")
          .upsert({ business_id: business.id, phone_key: editing.key, note: text, updated_at: new Date().toISOString() })
      : await supabase.from("customer_notes").delete().eq("business_id", business.id).eq("phone_key", editing.key);
    setSaving(false);
    if (error) return setError(errorMessage(error));
    setNotes((all) => {
      const next = { ...all };
      if (text) next[editing.key] = text;
      else delete next[editing.key];
      return next;
    });
    setEditing(null);
  }

  const q = query.trim().toLocaleLowerCase("tr-TR");
  const digits = query.replace(/\D/g, "");
  const list = (customers ?? []).filter(
    (c) => !q || c.name.toLocaleLowerCase("tr-TR").includes(q) || (digits && c.phone.replace(/\D/g, "").includes(digits)),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold">Müşteriler</h1>
      <p className="text-sm text-ink-3">
        Randevu alan herkes telefon numarasına göre burada listelenir. Uzun süredir gelmeyenlere WhatsApp’tan ulaşabilirsiniz.
        Notlarınızı yalnızca siz görürsünüz; müşterinin randevusunda da gösterilir. Seans paketinde, paketteki hizmetten
        tamamlanan her randevu bir seans düşer.
      </p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input className="input pl-9" placeholder="İsim veya telefon ara" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {customers === null ? (
        <div className="card mt-4 h-40 animate-pulse bg-surface-2" />
      ) : list.length === 0 ? (
        <div className="card mt-4 p-10 text-center text-ink-3">
          {customers.length === 0 ? "Henüz müşteriniz yok. İlk randevular geldikçe burada görünecek." : "Aramanıza uygun müşteri yok."}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-3">{list.length} müşteri</p>
          <ul className="mt-2 space-y-2">
            {list.map((c) => {
              const key = phoneKey(c.phone);
              return (
              <li key={c.phone} className="card flex flex-wrap items-center gap-4 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-400/15 font-semibold text-brand-300">
                  {c.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-ink-3">
                    {c.completed} ziyaret · {formatPrice(c.spent)}
                    {c.no_show > 0 && <span className="text-rose-400"> · {c.no_show} kez gelmedi</span>}
                  </p>
                  <p className="text-xs text-ink-3">
                    {c.next_appointment
                      ? `Sıradaki randevu: ${formatDate(c.next_appointment, { weekday: undefined })} ${formatTime(c.next_appointment)}`
                      : c.last_visit
                        ? `Son ziyaret: ${formatDate(c.last_visit, { weekday: undefined, year: "numeric" })}`
                        : "Henüz tamamlanan ziyaret yok"}
                  </p>
                  {key && notes[key] && editing?.key !== key && (
                    <p className="mt-1 whitespace-pre-line text-sm text-amber-200/90">{notes[key]}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {key && services.length > 0 && (
                    <button
                      className="btn btn-secondary px-3"
                      aria-label="Seans paketi ekle"
                      title="Seans paketi ekle"
                      onClick={() => setAddingFor(addingFor === key ? null : key)}
                    >
                      <Package className="size-4" />
                    </button>
                  )}
                  {key && (
                    <button
                      className="btn btn-secondary px-3"
                      aria-label={notes[key] ? "Notu düzenle" : "Not ekle"}
                      title={notes[key] ? "Notu düzenle" : "Not ekle"}
                      onClick={() => setEditing({ key, text: notes[key] ?? "" })}
                    >
                      <StickyNote className="size-4" />
                    </button>
                  )}
                  <a href={`tel:${c.phone}`} className="btn btn-secondary px-3" aria-label="Ara">
                    <Phone className="size-4" />
                  </a>
                  <a
                    href={whatsappLink(c.phone, `Merhaba ${c.name.split(" ")[0]}, ${business.name} olarak sizi tekrar görmek isteriz!`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary px-3 text-emerald-400"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle className="size-4" />
                  </a>
                </div>
                {key && (
                  <SessionPackages
                    businessId={business.id}
                    phoneKey={key}
                    customerName={c.name}
                    packages={packages.filter((p) => p.phone_key === key)}
                    services={services}
                    adding={addingFor === key}
                    onAddDone={() => setAddingFor(null)}
                    onChange={setPackages}
                  />
                )}
                {editing?.key === key && (
                  <form onSubmit={saveNote} className="w-full">
                    <textarea
                      autoFocus
                      rows={2}
                      maxLength={1000}
                      className="input"
                      placeholder="Örn. Kısa kesim sever, 3 numara"
                      aria-label={`${c.name} için not`}
                      value={editing.text}
                      onChange={(e) => setEditing({ key, text: e.target.value })}
                    />
                    <div className="mt-2 flex gap-2">
                      <button disabled={saving} className="btn btn-primary">
                        {saving && <Loader2 className="size-4 animate-spin" />} Kaydet
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Vazgeç</button>
                    </div>
                  </form>
                )}
              </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
