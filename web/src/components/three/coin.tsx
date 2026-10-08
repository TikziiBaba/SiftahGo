"use client";

import dynamic from "next/dynamic";

// Three.js sadece tarayıcıda ve sayfa açıldıktan sonra yüklenir.
export const Coin = dynamic(() => import("./coin-scene"), { ssr: false, loading: () => null });
