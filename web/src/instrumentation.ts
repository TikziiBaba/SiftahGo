import type { Instrumentation } from "next";

// Hata kaydı: sunucu hataları (sayfa, API, proxy) Supabase'deki error_logs tablosuna gider (yönetim > Hatalar).
// Geliştirmede kaydedilmez. Adres sorgu parametresiz yazılır (kişisel bilgi içerebilir).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NODE_ENV !== "production") return;
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = typeof error === "object" && error !== null && "digest" in error ? ` (digest ${String(error.digest)})` : "";
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/log_error`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_source: "server",
        p_message: `${err.name}: ${err.message}${digest}`,
        p_stack: err.stack ?? "",
        p_url: `${request.method} ${request.path.split("?")[0]} · ${context.routePath} (${context.routeType})`,
      }),
    });
  } catch {
    // Kayıt başarısızsa isteği etkilemesin.
  }
};
