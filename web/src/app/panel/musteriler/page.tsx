"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Phone, Search } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { PlanGate } from "@/components/plan-gate";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatDate, formatPrice, formatTime, whatsappLink } from "@/lib/format";

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
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .rpc("get_customers", { p_business_id: business.id })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        setCustomers((data ?? []) as Customer[]);
      });
  }, [business.id]);

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
            {list.map((c) => (
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
                </div>
                <div className="flex gap-1">
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
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
