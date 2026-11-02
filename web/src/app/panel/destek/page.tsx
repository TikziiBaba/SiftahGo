"use client";

import { Suspense } from "react";
import { useBusiness } from "@/components/panel-context";
import { SupportCenter } from "@/components/support-center";
import { isShowcase } from "@/lib/constants";

export default function PanelSupportPage() {
  const { business } = useBusiness();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Destek</h1>
      <div className="mt-5">
        <Suspense fallback={<div className="card h-24 animate-pulse" />}>
          <SupportCenter showcase={isShowcase(business)} />
        </Suspense>
      </div>
    </div>
  );
}
