"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { createClient } from "@/lib/supabase/client";

/** Özellik paketinizde yoksa yükseltme kartı gösterir, varsa içeriği. */
export function PlanGate({ feature, title, children }: { feature: string; title: string; children: React.ReactNode }) {
  const { business } = useBusiness();
  const [result, setResult] = useState<{ planId: string | null; allowed: boolean } | null>(null);
  const allowed = result?.planId === business.plan_id ? result.allowed : null;

  useEffect(() => {
    let active = true;
    createClient()
      .from("plans")
      .select("features")
      .eq("id", business.plan_id ?? "")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setResult({ planId: business.plan_id, allowed: !!data?.features?.includes(feature) });
      });
    return () => {
      active = false;
    };
  }, [business.plan_id, feature]);

  if (allowed === null) return <div className="mx-auto h-64 max-w-4xl animate-pulse rounded-[2rem] bg-surface-2" />;
  if (allowed) return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl pt-10">
      <div className="bezel">
        <div className="bezel-core p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-400/15 text-brand-300">
            <Lock className="size-5" />
          </span>
          <h1 className="mt-5 text-xl font-semibold">{title} paketinizde yok</h1>
          <p className="mt-2 text-sm text-ink-3">Esnaf veya Pro paketine geçerek bu özelliği hemen kullanmaya başlayabilirsiniz.</p>
          <Link href="/panel/abonelik" className="btn btn-primary mt-6">
            Paketleri gör
          </Link>
        </div>
      </div>
    </div>
  );
}
