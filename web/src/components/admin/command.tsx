"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, LayoutDashboard, Search, Store, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdminUser } from "@/lib/admin-types";

type Item = { kind: "page" | "business" | "user"; label: string; hint: string; href: string };

/** ⌘K / Ctrl+K: işletme, kullanıcı veya sayfaya yazarak git. Veri ilk açılışta bir kez yüklenir. */
export function CommandPalette({ pages, open, setOpen }: { pages: { href: string; label: string }[]; open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<{ businesses: Item[]; users: Item[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    if (data) return;
    const supabase = createClient();
    Promise.all([supabase.from("businesses").select("id, name, slug, city").order("name").limit(2000), supabase.rpc("admin_users")]).then(([b, u]) =>
      setData({
        businesses: ((b.data ?? []) as { id: string; name: string; slug: string; city: string }[]).map((x) => ({
          kind: "business",
          label: x.name,
          hint: [x.city, `/${x.slug}`].filter(Boolean).join(" · "),
          href: `/admin/isletmeler/${x.id}`,
        })),
        users: ((u.data ?? []) as AdminUser[]).map((x) => ({
          kind: "user",
          label: x.full_name || x.email,
          hint: x.email,
          href: `/admin/kullanicilar/${x.id}`,
        })),
      }),
    );
  }, [open, data]);

  const results = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr");
    const all: Item[] = [...pages.map((p) => ({ kind: "page" as const, label: p.label, hint: "Sayfa", href: p.href })), ...(data?.businesses ?? []), ...(data?.users ?? [])];
    if (!term) return all.slice(0, 9);
    return all.filter((i) => `${i.label} ${i.hint}`.toLocaleLowerCase("tr").includes(term)).slice(0, 12);
  }, [q, data, pages]);

  if (!open) return null;

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    setQ("");
    router.push(item.href);
  }

  const Icon = { page: LayoutDashboard, business: Store, user: User };

  return (
    <div className="fixed inset-0 z-[70] grid items-start justify-items-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Hızlı arama" onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line-strong">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") go(results[index]);
            }}
            placeholder="İşletme, kullanıcı (ad, e-posta) veya sayfa ara…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded-md px-1.5 py-0.5 text-2xs text-ink-3 ring-1 ring-line">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r, i) => {
            const I = Icon[r.kind];
            return (
              <li key={`${r.kind}-${r.href}`}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(r)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${i === index ? "bg-brand-400/10" : ""}`}
                >
                  <I className={`size-4 shrink-0 ${i === index ? "text-accent" : "text-ink-3"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-ink-3">{r.hint}</span>
                  </span>
                  {i === index && <CornerDownLeft className="size-4 text-ink-3" />}
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">{data ? "Sonuç yok" : "Yükleniyor…"}</li>}
        </ul>
      </div>
    </div>
  );
}
