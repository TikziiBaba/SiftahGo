"use client";

import { useSyncExternalStore } from "react";

// Çerez tercihi. Zorunlu çerezler (oturum, güvenlik, bu tercihin kendisi) her zaman açıktır; "işlevsel" depolama
// (son bakılan işletmeler) yalnızca onayla kullanılır. Seçim 180 gün saklanır; metin değişirse sürüm artırılır.
export const CONSENT_COOKIE = "sg_cerez";
const VERSION = "v1";
const MAX_AGE = 180 * 24 * 60 * 60;
const CHANGE = "sg-consent-change";
const OPEN = "sg-consent-open";
export const RECENT_KEY = "siftahgo.son-bakilan";

export type Consent = { functional: boolean };

function rawCookie() {
  return document.cookie.match(/(?:^|;\s*)sg_cerez=([^;]*)/)?.[1] ?? "";
}

function parse(raw: string): Consent | null {
  const [version, functional] = decodeURIComponent(raw).split(".");
  return version === VERSION ? { functional: functional === "f1" } : null;
}

export function readConsent() {
  return parse(rawCookie());
}

export function saveConsent(consent: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${VERSION}.${consent.functional ? "f1" : "f0"}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  if (!consent.functional) {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // Depolama kapalıysa silinecek bir şey de yoktur.
    }
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** Alt bilgideki "Çerez tercihleri" düğmesi tercih penceresini açar. */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN));
}

export function onConsentOpen(listener: () => void) {
  window.addEventListener(OPEN, listener);
  return () => window.removeEventListener(OPEN, listener);
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE, listener);
  return () => window.removeEventListener(CHANGE, listener);
}

/** undefined: sunucuda / henüz okunmadı; null: kullanıcı karar vermedi; aksi halde seçim. */
export function useConsent(): Consent | null | undefined {
  const raw = useSyncExternalStore(subscribe, rawCookie, () => undefined);
  return raw === undefined ? undefined : parse(raw);
}
