"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
/** Site anahtarı yoksa bot kontrolü gösterilmez ve formlar token beklemez. */
export const turnstileEnabled = !!SITE_KEY;

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile yüklenemedi"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile bot kontrolü. Token Supabase'e `captchaToken` olarak gider (Supabase > Authentication >
 * Attack Protection). Token tek kullanımlıktır: denemeden sonra `key` değiştirilerek yenilenir.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let id: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          // Giriş/kayıt sayfaları açık temada. Kutu yalnızca ziyaretçinin bir şey yapması gerekirse görünür;
          // çoğu zaman doğrulama görünmeden biter ve form tek ekrana sığar.
          theme: "light",
          appearance: "interaction-only",
          language: "tr",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center empty:hidden" />;
}
