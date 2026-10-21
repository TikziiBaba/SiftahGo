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

/**
 * Kurulum (başvuru) sayfası: onaylanmamış işletme (henüz açılmadıysa null) ve başvuru gönderildikten
 * ya da durum sorulduktan sonra paneli yenileme.
 */
export const SetupContext = createContext<{ business: Business | null; refresh: () => Promise<void> }>({
  business: null,
  refresh: async () => {},
});
