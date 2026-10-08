"use client";

import { createContext, useContext } from "react";
import type { Business } from "@/lib/types";

type Ctx = { business: Business; refresh: () => Promise<void> };

export const BusinessContext = createContext<Ctx | null>(null);

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness panel içinde kullanılmalı");
  return ctx;
}

/** Kurulum sayfası işletmeyi oluşturduktan sonra paneli yenilemek için kullanır. */
export const SetupDoneContext = createContext<() => Promise<void>>(async () => {});
