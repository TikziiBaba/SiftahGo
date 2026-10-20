"use client";

import { readConsent, RECENT_KEY } from "@/lib/consent";

// Son bakılan işletmeler (ana sayfadaki "Son baktıkların"). Yalnızca işlevsel çerez onayı varsa bu cihazda tutulur.
export type RecentBusiness = { slug: string; name: string; category: string; logo_url: string | null; city: string };
const MAX = 8;

export function getRecent(): RecentBusiness[] {
  if (!readConsent()?.functional) return [];
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? (list as RecentBusiness[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(b: RecentBusiness) {
  if (!readConsent()?.functional) return;
  try {
    const list = [b, ...getRecent().filter((x) => x.slug !== b.slug)].slice(0, MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Depolama kapalı veya dolu: hatırlanmaz, sorun değil.
  }
}
