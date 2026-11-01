"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { dateTime, Skeleton, TONE } from "@/components/admin/ui";
import { SupportThread } from "@/components/support-center";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_CATEGORIES, SUPPORT_STATUS } from "@/lib/constants";
import { errorMessage } from "@/lib/format";
import type { SupportMessage, SupportTicket } from "@/lib/types";

type Row = SupportTicket & { user: { full_name: string; phone: string | null } | null; business: { name: string } | null };

export default function AdminSupportTicket() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Row | null | undefined>(undefined);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"reply" | "reply-close" | "close" | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [t, m] = await Promise.all([
      supabase.from("support_tickets").select("*, user:profiles(full_name, phone), business:businesses(name)").eq("id", id).maybeSingle(),
      supabase.from("support_messages").select("*").eq("ticket_id", id).order("created_at"),
    ]);
    if (t.error || m.error) return setError(errorMessage(t.error ?? m.error));
    setTicket((t.data as unknown as Row | null) ?? null);
    setMessages((m.data ?? []) as SupportMessage[]);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- talebi ilk açılışta yükle
    load();
  }, [load]);

  async function reply(close: boolean) {
    setBusy(close ? "reply-close" : "reply");
    setError("");
    const { error } = await createClient().rpc("admin_reply_support_ticket", { p_id: id, p_body: body, p_close: close });
    setBusy(null);
    if (error) return setError(errorMessage(error));
    setBody("");
    load();
  }

  async function closeTicket() {
    setBusy("close");
    setError("");
    const { error } = await createClient().rpc("admin_close_support_ticket", { p_id: id });
    setBusy(null);
    if (error) return setError(errorMessage(error));
    load();
  }

  if (ticket === undefined) return error ? <p className="mx-auto max-w-3xl rounded-2xl bg-rose-500/10 p-4 text-sm text-bad">{error}</p> : <Skeleton className="mx-auto h-96 max-w-3xl" />;
  if (ticket === null) return <p className="mx-auto max-w-3xl text-sm text-ink-3">Talep bulunamadı.</p>;

  const valid = body.trim().length >= 2;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/destek" className="btn btn-ghost -ml-3 py-2">
        <ArrowLeft className="size-4" /> Tüm talepler
      </Link>
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 basis-48 break-words text-lg font-semibold">{ticket.subject}</h1>
          <span className={`chip ${ticket.audience === "business" ? TONE.brand : TONE.muted}`}>{ticket.audience === "business" ? "İşletme" : "Müşteri"}</span>
          <span className={`chip ${SUPPORT_STATUS[ticket.status].className}`}>{SUPPORT_STATUS[ticket.status].label}</span>
        </div>
        <p className="mt-1 text-sm text-ink-3">
          <Link href={`/admin/kullanicilar/${ticket.user_id}`} className="font-medium text-ink-2 hover:text-accent">
            {ticket.user?.full_name || "Kullanıcı"}
          </Link>
          {ticket.user?.phone && ` · ${ticket.user.phone}`}
          {ticket.business && ticket.business_id && (
            <>
              {" · "}
              <Link href={`/admin/isletmeler/${ticket.business_id}`} className="font-medium text-ink-2 hover:text-accent">
                {ticket.business.name}
              </Link>
            </>
          )}
          {" · "}
          {SUPPORT_CATEGORIES[ticket.category]} · {dateTime(ticket.created_at)}
        </p>

        <div className="mt-5">
          <SupportThread messages={messages} mine="admin" />
        </div>

        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <label className="block">
            <span className="label">Yanıtınız</span>
            <textarea className="input" maxLength={4000} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          {error && <p className="text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!valid || busy !== null} onClick={() => reply(false)} className="btn btn-primary">
              {busy === "reply" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Yanıtla
            </button>
            <button type="button" disabled={!valid || busy !== null} onClick={() => reply(true)} className="btn btn-secondary">
              {busy === "reply-close" && <Loader2 className="size-4 animate-spin" />} Yanıtla ve kapat
            </button>
            {ticket.status !== "closed" && (
              <button type="button" disabled={busy !== null} onClick={closeTicket} className="btn btn-ghost">
                {busy === "close" && <Loader2 className="size-4 animate-spin" />} Yanıtsız kapat
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
