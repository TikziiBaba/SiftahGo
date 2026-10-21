// Herkese açık sayfalar (ana sayfa, Keşfet, /esnaf) Supabase istemcisini buradan, gerektiğinde yükler: giriş
// yapmamış ziyaretçi kütüphaneyi (~65 KB gzip) hiç indirmez. Bu dosya kütüphaneyi kendisi içe aktarmamalı.

const READY = "sg-supabase-ready";
let ready = false;

export async function loadClient() {
  const { createClient } = await import("./client");
  return createClient();
}

/** client.ts istemciyi ilk kez kurunca çağırır. */
export function markClientReady() {
  ready = true;
  window.dispatchEvent(new Event(READY));
}

/** İstemci kurulunca (kurulmuşsa hemen) çalışır; istemciyi kendisi yüklemez. */
export function onClientReady(fn: () => void) {
  if (ready) fn();
  else window.addEventListener(READY, fn, { once: true });
}

/** Tarayıcıda Supabase oturum çerezi var mı; yoksa ziyaretçidir. */
export function hasSessionCookie() {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie);
}
