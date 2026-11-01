"use client";

import { Suspense } from "react";
import { SupportCenter } from "@/components/support-center";

export default function PanelSupportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Destek</h1>
      <div className="mt-5">
        <Suspense fallback={<div className="card h-24 animate-pulse" />}>
          <SupportCenter />
        </Suspense>
      </div>
    </div>
  );
}
