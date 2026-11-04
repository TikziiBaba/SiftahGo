import posthog from "posthog-js";
import { reportClientError } from "@/lib/error-log";

// Hata kaydı: tarayıcıda yakalanmayan hatalar Supabase'deki error_logs tablosuna gider (yönetim > Hatalar).
window.addEventListener("error", (e) => reportClientError(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason));

// Ziyaret istatistiği (PostHog). Çerezsiz: tarayıcıya bir şey yazılmaz, ziyaretçi sunucuda günlük değişen bir
// özetle sayılır; bu yüzden çerez onayı gerekmez. İstekler /ingest üzerinden gider (next.config.ts), CSP'ye yeni adres
// eklenmez. Oturum kaydı ve anket kapalı: dışarıdan betik yüklemezler. Anahtar yoksa (yerel kurulum) hiç çalışmaz.
const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
if (key) {
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    cookieless_mode: "always",
    person_profiles: "never",
    disable_session_recording: true,
    disable_surveys: true,
    autocapture: false,
  });
}
