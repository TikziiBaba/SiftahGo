"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

export type Branch = { id: string; name: string; approval_status: string };

/**
 * Şube seçici: hesabın işletmeleri arasında geçiş (set_active_business) ve yeni şube ekleme. Tek işletmede yalnızca
 * "Şube ekle" bağlantısı görünür; şube açmak ücretli Pro paketi ister (sunucu denetler, enforce_branch_rules).
 */
export function BranchSwitcher({ branches, currentId, onSwitched }: { branches: Branch[]; currentId: string | null; onSwitched: () => Promise<void> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function choose(id: string) {
    setOpen(false);
    if (id === currentId) return;
    const { error } = await createClient().rpc("set_active_business", { p_id: id });
    if (error) return setError(errorMessage(error));
    await onSwitched();
    router.push("/panel");
  }

  if (branches.length < 2) {
    return (
      <Link href="/panel/sube-ekle" className="btn btn-ghost py-2 text-sm" title="Pro pakette başka dükkânınızı da ekleyin">
        <Plus className="size-4" /> <span className="hidden lg:inline">Şube ekle</span>
      </Link>
    );
  }
  const current = branches.find((b) => b.id === currentId);
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-secondary max-w-56 py-2" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Store className="size-4 shrink-0" /> <span className="truncate">{current?.name ?? "Şube seçin"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-line">
          {branches.map((b) => (
            <button
              key={b.id}
              role="menuitem"
              onClick={() => choose(b.id)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-tint/5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.name}</span>
                {b.approval_status !== "approved" && (
                  <span className="text-2xs text-ink-3">{b.approval_status === "pending" ? "Onay bekliyor" : "Başvuru düzeltilmeli"}</span>
                )}
              </span>
              {b.id === currentId && <Check className="size-4 text-accent" />}
            </button>
          ))}
          <Link href="/panel/sube-ekle" role="menuitem" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl border-t border-line px-3 py-2 text-sm text-accent hover:bg-tint/5">
            <Plus className="size-4" /> Şube ekle
          </Link>
        </div>
      )}
      {error && <p className="absolute right-0 top-full mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
