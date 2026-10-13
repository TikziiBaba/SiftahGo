"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { dateTime, Empty, PageTitle, Skeleton, Tabs } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

type ErrorLog = {
  id: string;
  source: "web" | "server" | "mobile";
  message: string;
  stack: string;
  url: string;
  app_version: string;
  user_agent: string;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
};

const SOURCE = { web: "Web (tarayıcı)", server: "Web (sunucu)", mobile: "Mobil" } as const;

/** Uygulama hataları (log_error yazar): açık olanlar, çözüldü işareti ve silme. */
export default function AdminErrors() {
  const [rows, setRows] = useState<ErrorLog[] | null>(null);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("error_logs").select("*").order("last_seen", { ascending: false }).limit(500);
    if (error) return setError(errorMessage(error));
    setRows((data ?? []) as ErrorLog[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hataları ilk açılışta yükle
    load();
  }, [load]);

  async function resolve(id: string) {
    const { error } = await createClient().from("error_logs").update({ resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return setError(errorMessage(error));
    load();
  }

  async function remove(id: string) {
    if (!confirm("Bu hata kaydı silinsin mi?")) return;
    const { error } = await createClient().from("error_logs").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    load();
  }

  const open = (rows ?? []).filter((r) => !r.resolved_at);
  const resolved = (rows ?? []).filter((r) => r.resolved_at);
  const list = tab === "open" ? open : resolved;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageTitle
        title="Hatalar"
        hint="Web ve mobilde kullanıcıların karşılaştığı hatalar. Aynı hata tek satırda sayılır; çözülen hata tekrar edince yeniden açılır."
      >
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { id: "open", label: "Açık", count: open.length },
            { id: "resolved", label: "Çözüldü", count: resolved.length },
          ]}
        />
      </PageTitle>

      {error && <p className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>}

      {rows === null ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty>{tab === "open" ? "Açık hata yok." : "Çözülmüş hata yok."}</Empty>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-mono text-sm font-medium">{r.message}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {SOURCE[r.source]} · {r.count} kez · son {dateTime(r.last_seen)} · ilk {dateTime(r.first_seen)}
                    {r.url && ` · ${r.url}`}
                    {r.app_version && ` · sürüm ${r.app_version}`}
                  </p>
                </div>
                {!r.resolved_at && (
                  <button className="btn btn-secondary py-1.5" onClick={() => resolve(r.id)}>
                    <Check className="size-4" /> Çözüldü
                  </button>
                )}
                <button className="btn btn-ghost px-2.5 py-1.5 text-rose-400" aria-label="Sil" onClick={() => remove(r.id)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              {(r.stack || r.user_agent) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-3">Ayrıntı</summary>
                  {r.stack && <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-xs text-ink-2">{r.stack}</pre>}
                  {r.user_agent && <p className="mt-2 break-words text-xs text-ink-3">{r.user_agent}</p>}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
