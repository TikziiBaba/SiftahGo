"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Yazdır" }: { label?: string }) {
  return (
    <button type="button" onClick={() => print()} className="btn btn-primary">
      <Printer className="size-4" /> {label}
    </button>
  );
}
