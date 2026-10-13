import { reportClientError } from "@/lib/error-log";

// Hata kaydı: tarayıcıda yakalanmayan hatalar Supabase'deki error_logs tablosuna gider (yönetim > Hatalar).
window.addEventListener("error", (e) => reportClientError(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason));
