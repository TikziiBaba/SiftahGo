"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlarmClock, Bell, CalendarClock, CalendarPlus, CheckCircle2, MessageSquareText, Star, XCircle, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, todayStr } from "@/lib/format";

type Item = {
  id: string;
  kind: "booked" | "confirmed" | "cancelled" | "rescheduled" | "reminder" | "review" | "reviewed";
  recipient: "customer" | "business";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

const KIND: Record<Item["kind"], { icon: LucideIcon; className: string }> = {
  booked: { icon: CalendarPlus, className: "bg-brand-400/10 text-brand-300" },
  confirmed: { icon: CheckCircle2, className: "bg-emerald-400/10 text-emerald-300" },
  cancelled: { icon: XCircle, className: "bg-rose-400/10 text-rose-300" },
  rescheduled: { icon: CalendarClock, className: "bg-brand-400/10 text-brand-300" },
  reminder: { icon: AlarmClock, className: "bg-gold/10 text-gold" },
  review: { icon: Star, className: "bg-gold/10 text-gold" },
  reviewed: { icon: MessageSquareText, className: "bg-gold/10 text-gold" },
};

/** Bugünkü bildirimde saat, daha eskide "12 Eki" */
function when(iso: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
  if (day === todayStr()) return formatTime(iso);
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }).format(new Date(iso));
}

/** Üst menüdeki bildirim düğmesi. Yeni bildirimler Realtime ile anında gelir. */
export function InboxBell() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  // Açılışta okunmamış olanlar; liste açık kaldıkça vurgulu görünür.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from("inbox")
        .select("id, kind, recipient, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) setItems(data as Item[]);
    }
    // İlk yükleme abonelik kurulunca yapılır; arada gelen bildirim kaçmaz.
    const channel = supabase
      .channel(`inbox-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!userId) return null;
  const unread = items.filter((i) => !i.read_at).length;

  // Liste açılınca hepsi okundu sayılır.
  function toggle() {
    if (!open && unread) {
      setFresh(new Set(items.filter((i) => !i.read_at).map((i) => i.id)));
      const now = new Date().toISOString();
      setItems((list) => list.map((i) => (i.read_at ? i : { ...i, read_at: now })));
      createClient().rpc("mark_inbox_read").then(() => {});
    }
    setOpen(!open);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative grid size-10 place-items-center rounded-full text-ink-2 ring-1 ring-line-strong transition-colors duration-300 ease-spring hover:bg-white/[0.05] hover:text-ink"
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-gold px-1 text-3xs font-bold leading-none text-brand-950 ring-2 ring-bg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Bildirimler"
          className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl bg-surface ring-1 ring-line-strong shadow-[0_24px_60px_-12px_rgb(0_0_0/0.8)]"
        >
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Bildirimler</p>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-3">
              Henüz bildirim yok. Yeni randevular, onaylar ve iptaller burada görünür.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] divide-y divide-line overflow-y-auto">
              {items.map((item) => {
                const k = KIND[item.kind];
                const isNew = !item.read_at || fresh.has(item.id);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.kind === "reviewed" ? "/panel/yorumlar" : item.recipient === "business" ? "/panel" : "/hesabim"}
                      onClick={() => setOpen(false)}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] ${isNew ? "bg-brand-400/[0.05]" : ""}`}
                    >
                      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${k.className}`}>
                        <k.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="flex-1 truncate text-sm font-semibold text-ink">{item.title}</span>
                          <span className="shrink-0 text-xs text-ink-3">{when(item.created_at)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2">{item.body}</span>
                      </span>
                      {isNew && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-400" aria-label="Yeni" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
