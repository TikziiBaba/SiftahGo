"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cookie, Lock, X } from "lucide-react";
import { onConsentOpen, openConsentSettings, readConsent, saveConsent, useConsent } from "@/lib/consent";

/**
 * Çerez bandı ve tercih penceresi. Karar verilmemişse sayfanın altında bant görünür; "Tümünü kabul et" ile
 * "Yalnızca zorunlu" eşit ağırlıktadır (KVKK Çerez Rehberi). Reklam veya izleme çerezi kullanılmaz.
 */
export function CookieConsent() {
  const consent = useConsent();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [functional, setFunctional] = useState(false);

  useEffect(
    () =>
      onConsentOpen(() => {
        setFunctional(readConsent()?.functional ?? false);
        setPrefsOpen(true);
      }),
    [],
  );

  if (consent === undefined) return null;

  function decide(fn: boolean) {
    saveConsent({ functional: fn });
    setPrefsOpen(false);
  }

  return (
    <>
      {consent === null && !prefsOpen && (
        <section
          role="region"
          aria-label="Çerez bildirimi"
          className="fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-50 rounded-3xl print:hidden bg-surface p-5 text-sm shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] ring-1 ring-line-strong md:inset-x-auto md:bottom-5 md:left-5 md:max-w-md"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-400/12 text-accent">
              <Cookie className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink">Çerezleri nasıl kullanıyoruz?</h2>
              <p className="mt-1 leading-relaxed text-ink-2">
                Oturumunuzu açık tutmak ve güvenlik için <strong className="font-medium text-ink">zorunlu</strong> çerezler kullanırız. İzin
                verirseniz son baktığınız işletmeleri bu cihazda hatırlarız. Reklam veya izleme çerezi yoktur.{" "}
                <Link href="/yasal/cerez-politikasi" className="text-accent underline-offset-4 hover:underline">
                  Çerez politikası
                </Link>
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => decide(false)} className="btn btn-secondary">
              Yalnızca zorunlu
            </button>
            <button type="button" onClick={() => decide(true)} className="btn btn-secondary">
              Tümünü kabul et
            </button>
          </div>
          <button type="button" onClick={openConsentSettings} className="mt-2 w-full rounded-full py-1.5 text-xs font-medium text-ink-3 hover:text-ink">
            Tercihleri yönet
          </button>
        </section>
      )}
      {prefsOpen && (
        <Preferences
          functional={functional}
          setFunctional={setFunctional}
          onSave={() => decide(functional)}
          onAcceptAll={() => decide(true)}
          onClose={() => setPrefsOpen(false)}
        />
      )}
    </>
  );
}

function Preferences({
  functional,
  setFunctional,
  onSave,
  onAcceptAll,
  onClose,
}: {
  functional: boolean;
  setFunctional: (v: boolean) => void;
  onSave: () => void;
  onAcceptAll: () => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-black/50 p-3 backdrop-blur-sm sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cerez-baslik"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-surface p-6 text-sm shadow-2xl ring-1 ring-line-strong"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cerez-baslik" className="text-lg font-semibold text-ink">
              Çerez tercihleri
            </h2>
            <p className="mt-1 text-ink-3">Seçiminizi istediğiniz zaman alt bilgideki “Çerez tercihleri”nden değiştirebilirsiniz.</p>
          </div>
          <button ref={first} type="button" onClick={onClose} aria-label="Kapat" className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 ring-1 ring-line hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <ul className="mt-5 space-y-3">
          <li className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">Zorunlu</p>
              <span className="chip gap-1 bg-tint/[0.05] text-ink-3">
                <Lock className="size-3" /> Her zaman açık
              </span>
            </div>
            <p className="mt-1.5 leading-relaxed text-ink-3">
              Giriş oturumu, güvenlik doğrulaması (Cloudflare Turnstile), davet kodu ve bu tercihin kendisi. Bunlar olmadan site çalışmaz.
            </p>
          </li>
          <li className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="font-medium text-ink">İşlevsel</span>
              <span className="relative inline-flex">
                <input type="checkbox" className="peer sr-only" checked={functional} onChange={(e) => setFunctional(e.target.checked)} />
                <span className="h-6 w-11 rounded-full bg-tint/[0.12] transition-colors duration-300 peer-checked:bg-brand-500 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-400/30" />
                <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-300 ease-spring peer-checked:translate-x-5" />
              </span>
            </label>
            <p className="mt-1.5 leading-relaxed text-ink-3">
              Ana sayfada “Son baktıkların” bölümü için son baktığınız işletmeler bu cihazda saklanır, sunucuya gönderilmez.
            </p>
          </li>
        </ul>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onSave} className="btn btn-secondary">
            Seçimi kaydet
          </button>
          <button type="button" onClick={onAcceptAll} className="btn btn-primary">
            Tümünü kabul et
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-ink-3">
          Ayrıntılar:{" "}
          <Link href="/yasal/cerez-politikasi" onClick={onClose} className="text-accent underline-offset-4 hover:underline">
            Çerez politikası
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Alt bilgide ve çerez politikasında tercih penceresini açan düğme. */
export function CookieSettingsButton({ className, label = "Çerez tercihleri" }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      {label}
    </button>
  );
}
