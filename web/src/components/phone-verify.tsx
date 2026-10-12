"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

/**
 * WhatsApp ile telefon doğrulama (ters doğrulama): müşteri kodu SiftahGo numarasına gönderir,
 * sunucu (/api/whatsapp) gönderen numarayı hesaba bağlar. Bu bileşen doğrulanana kadar bekler.
 */
export function PhoneVerify({ whatsappNumber, onVerified }: { whatsappNumber: string; onVerified: (phone: string) => void }) {
  const supabase = createClient();
  const [code, setCode] = useState<{ value: string; expires: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!code) return;
    const timer = setInterval(async () => {
      if (Date.now() > code.expires) {
        clearInterval(timer);
        setExpired(true);
        return;
      }
      const { data } = await supabase.from("phone_verifications").select("phone, verified_at").maybeSingle();
      if (data?.verified_at && data.phone) {
        clearInterval(timer);
        onVerified(data.phone);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [supabase, code, onVerified]);

  async function start() {
    setBusy(true);
    setError("");
    setExpired(false);
    const { data, error } = await supabase.rpc("start_phone_verification");
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setCode({ value: data as string, expires: Date.now() + 15 * 60_000 });
  }

  const text = code ? `SiftahGo doğrulama kodum: ${code.value}` : "";

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-medium">Telefonunuzu doğrulayın</p>
      <p className="mt-1 text-sm text-ink-3">
        Sahte randevuları önlemek için numaranızı bir kez WhatsApp ile doğruluyoruz. Ücret alınmaz.
      </p>
      {!code || expired ? (
        <button type="button" onClick={start} disabled={busy} className="btn btn-primary mt-3">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
          {expired ? "Kodun süresi doldu, yeni kod al" : "WhatsApp ile doğrula"}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary w-full"
          >
            <MessageCircle className="size-4" /> WhatsApp&apos;ı aç ve mesajı gönder
          </a>
          <p className="text-sm text-ink-3">
            Hazır mesajı (<span className="font-mono text-ink-2">{code.value}</span>) değiştirmeden gönderin.
            Gönderdikten sonra bu sayfaya dönün, numaranız kendiliğinden doğrulanır.
          </p>
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="size-4 animate-spin" /> Mesajınız bekleniyor…
          </p>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
