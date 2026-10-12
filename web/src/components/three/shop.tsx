"use client";

import dynamic from "next/dynamic";

// Three.js sadece tarayıcıda ve sayfa açıldıktan sonra yüklenir.
export const Shop = dynamic(() => import("./shop-scene"), { ssr: false, loading: () => null });
