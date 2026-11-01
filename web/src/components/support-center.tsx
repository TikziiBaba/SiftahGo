"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LifeBuoy, Loader2, Plus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_CATEGORIES, SUPPORT_STATUS } from "@/lib/constants";
import { errorMessage, formatDate } from "@/lib/format";
import type { SupportCategory, SupportMessage, SupportTicket } from "@/lib/types";

const when = (iso: string) => formatDate(iso, { weekday: undefined, month: "short", hour: "2-digit", minute: "2-digit" });

/** Bir talebin konuşması. Kullanıcı ve yönetici ekranları ortak kullanır; `mine` o ekranın kendi mesajları. */
export function SupportThread({ messages, mine }: { messages: SupportMessage[]; mine: "user" | "admin" }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const own = m.from_admin === (mine === "admin");
        return (
          <li key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl p-3.5 text-sm ring-1 ${own ? "bg-brand-400/10 ring-brand-400/20" : "bg-tint/[0.03] ring-line"}`}>
              <p className="text-2xs font-semibold text-ink-3">
                {m.from_admin ? "SiftahGo Destek" : mine === "user" ? "Siz" : "Kullanıcı"} · {when(m.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Kullanıcının destek talepleri: liste, yeni talep ve konuşma. Hesabım ve panel ortak kullanır; seçili talep adreste durur. */
export function SupportCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("talep");
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", session.user.id)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) return setError(errorMessage(error));
    setTickets((data ?? []) as SupportTicket[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- talepleri ilk açılışta yükle
    load();
  }, [load]);

  /** Sekme gibi diğer sorgu değerleri korunarak seçili talep değişir. */
  function open(id: string | null) {
    const q = new URLSearchParams(params);
    if (id) q.set("talep", id);
    else q.delete("talep");
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  if (error) return <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-bad">{error}</p>;

  const ticket = tickets?.find((t) => t.id === selected);
  if (ticket) return <TicketView key={ticket.id} ticket={ticket} onBack={() => open(null)} onChanged={load} />;

  if (creating) {
    return (
      <NewTicket
        onCancel={() => setCreating(false)}
        onCreated={async (id) => {
          await load();
          setCreating(false);
          open(id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-lg text-sm text-ink-3">
          SiftahGo ekibine yazın. Saat, fiyat gibi randevu konularında en hızlı yanıtı işletmenin kendisi verir.
        </p>
        <button type="button" onClick={() => setCreating(true)} className="btn btn-primary">
          <Plus className="size-4" /> Yeni talep
        </button>
      </div>
      {tickets === null ? (
        <div className="card h-24 animate-pulse" />
      ) : tickets.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-400/12 text-accent">
            <LifeBuoy className="size-6" />
          </span>
          <p className="mt-4 font-semibold">Henüz destek talebiniz yok</p>
          <p className="mt-1 max-w-sm text-sm text-ink-3">Bir sorun yaşarsanız talep açın; yanıtımız e-posta adresinize de gelir.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => open(t.id)} className="card flex w-full flex-wrap items-center gap-3 p-4 text-left transition hover:ring-line-strong">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate font-semibold">{t.subject}</span>
                  <span className="block text-xs text-ink-3">
                    {SUPPORT_CATEGORIES[t.category]} · {when(t.last_message_at)}
                  </span>
                </span>
                <span className={`chip ${SUPPORT_STATUS[t.status].className}`}>{SUPPORT_STATUS[t.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTicket({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [category, setCategory] = useState<SupportCategory>("teknik");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await createClient().rpc("open_support_ticket", { p_category: category, p_subject: subject, p_body: body });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onCreated(data as string);
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="font-semibold">Yeni destek talebi</h2>
      <label className="block">
        <span className="label">Konu başlığı</span>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
          {Object.entries(SUPPORT_CATEGORIES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Kısaca sorun</span>
        <input className="input" required minLength={3} maxLength={120} placeholder="Örn. Ödemem görünmüyor" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Mesajınız</span>
        <textarea className="input" required minLength={2} maxLength={4000} rows={6} placeholder="Ne oldu, ne zaman oldu? Varsa işletme adını ve randevu tarihini yazın." value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="btn btn-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Gönder
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Vazgeç
        </button>
      </div>
    </form>
  );
}

function TicketView({ ticket, onBack, onChanged }: { ticket: SupportTicket; onBack: () => void; onChanged: () => Promise<void> }) {
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("support_messages").select("*").eq("ticket_id", ticket.id).order("created_at");
    if (error) return setError(errorMessage(error));
    setMessages((data ?? []) as SupportMessage[]);
  }, [ticket.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mesajları ilk açılışta yükle
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().rpc("reply_support_ticket", { p_id: ticket.id, p_body: body });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setBody("");
    await Promise.all([load(), onChanged()]);
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn btn-ghost -ml-3 py-2">
        <ArrowLeft className="size-4" /> Tüm talepler
      </button>
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 basis-48 break-words font-semibold">{ticket.subject}</h2>
          <span className={`chip ${SUPPORT_STATUS[ticket.status].className}`}>{SUPPORT_STATUS[ticket.status].label}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-3">{SUPPORT_CATEGORIES[ticket.category]}</p>
        <div className="mt-5">{messages === null ? <div className="h-24 animate-pulse rounded-2xl bg-surface-2" /> : <SupportThread messages={messages} mine="user" />}</div>
        <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-5">
          {ticket.status === "closed" && <p className="text-sm text-ink-3">Bu talep kapatıldı. Sorun devam ediyorsa yazın; talep yeniden açılır.</p>}
          <label className="block">
            <span className="label">Yanıtınız</span>
            <textarea className="input" required minLength={2} maxLength={4000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button disabled={busy} className="btn btn-primary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Gönder
          </button>
        </form>
      </div>
    </div>
  );
}
