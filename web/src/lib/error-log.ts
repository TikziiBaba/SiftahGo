import { createClient } from "@/lib/supabase/client";

// Tarayıcı eklentilerinden ve zararsız tarayıcı uyarılarından gelen gürültü kaydedilmez.
const IGNORED = [/ResizeObserver loop/, /^Script error\.?$/, /chrome-extension:|moz-extension:|safari-extension:/];
// Bir sayfa açılışında en fazla bu kadar hata gönderilir (döngüdeki hata tabloyu doldurmasın).
const MAX_PER_PAGE = 10;
let sent = 0;

/**
 * Tarayıcıdaki hatayı Supabase'deki error_logs tablosuna yazar (yönetim > Hatalar). Geliştirmede kaydetmez.
 * Adres sorgu parametresiz gönderilir (kişisel bilgi içerebilir).
 */
export function reportClientError(error: unknown) {
  if (process.env.NODE_ENV !== "production" || sent >= MAX_PER_PAGE) return;
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
  const message = `${err.name}: ${err.message}`;
  if (IGNORED.some((re) => re.test(message) || re.test(err.stack ?? ""))) return;
  sent++;
  createClient()
    .rpc("log_error", {
      p_source: "web",
      p_message: message,
      p_stack: err.stack ?? "",
      p_url: location.pathname,
      p_user_agent: navigator.userAgent,
    })
    .then(
      () => {},
      () => {},
    );
}
