"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, MailCheck, Store, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/**
 * Google hesabıyla giriş/kayıt. Dönüşte /auth/callback oturumu açar; `next` yoksa hesaba göre
 * panel, yönetim veya Randevularım'a gönderir. `business`: işletme hesabı olarak açılır.
 */
function GoogleButton({ next, business }: { next: string | null; business?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Düğme, Supabase'de Google girişi açıksa görünür (Authentication > Providers > Google).
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    })
      .then((r) => r.json())
      .then((s: { external?: { google?: boolean } }) => setEnabled(!!s.external?.google))
      .catch(() => {});
  }, []);

  async function go() {
    setBusy(true);
    setError("");
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    if (business) params.set("rol", "isletme");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?${params}` },
    });
    if (error) {
      setBusy(false);
      setError(errorMessage(error));
    }
  }

  if (!enabled) return null;

  return (
    <div>
      <button type="button" disabled={busy} onClick={go} className="btn btn-secondary w-full py-3">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />} Google ile devam et
      </button>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      <div className="my-5 flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" /> veya e-posta ile <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4.5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    params.get("hata") === "google"
      ? "Google ile giriş tamamlanamadı. Lütfen tekrar deneyin."
      : params.get("hata")
        ? "Doğrulama bağlantısı geçersiz veya süresi dolmuş."
        : "",
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    const [{ data: profile }, { data: admin }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle(),
      supabase.rpc("is_admin"),
    ]);
    router.replace(safeNext(params.get("next")) ?? (admin === true ? "/admin" : profile?.role === "business" ? "/panel" : "/hesabim"));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <GoogleButton next={safeNext(params.get("next"))} />
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0" htmlFor="password">Şifre</label>
          <Link href="/sifremi-unuttum" className="text-sm text-brand-300 hover:underline">Şifremi unuttum</Link>
        </div>
        <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Giriş Yap
      </button>
      <p className="text-center text-sm text-ink-3">
        Hesabın yok mu?{" "}
        <Link href="/kayit" className="font-medium text-brand-300 hover:underline">Kayıt ol</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<"customer" | "business">(params.get("rol") === "isletme" ? "business" : "customer");
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const target = role === "business" ? "/panel" : safeNext(params.get("next")) ?? "/hesabim";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await createClient().auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), phone: form.phone.trim(), role },
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
      },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    if (!data.session) return setCheckEmail(true);
    router.replace(target);
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-12 text-brand-300" />
        <h2 className="mt-3 text-lg font-semibold">E-postanızı kontrol edin</h2>
        <p className="mt-2 text-sm text-ink-2">
          <b>{form.email}</b> adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra hesabınız açılacak.
        </p>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {([
          ["customer", "Randevu almak istiyorum", User],
          ["business", "İşletmem var", Store],
        ] as const).map(([value, text, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRole(value)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition ${
              role === value ? "border-brand-400 bg-brand-400/10 text-brand-300 ring-2 ring-brand-400/20" : "border-line text-ink-2"
            }`}
          >
            <Icon className="size-5" /> {text}
          </button>
        ))}
      </div>
      <GoogleButton next={target} business={role === "business"} />
      <div>
        <label className="label" htmlFor="full_name">Ad Soyad</label>
        <input id="full_name" required autoComplete="name" className="input" value={form.full_name} onChange={set("full_name")} />
      </div>
      <div>
        <label className="label" htmlFor="phone">Telefon</label>
        <input id="phone" type="tel" autoComplete="tel" placeholder="05xx xxx xx xx" className="input" value={form.phone} onChange={set("phone")} />
      </div>
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required autoComplete="email" className="input" value={form.email} onChange={set("email")} />
      </div>
      <div>
        <label className="label" htmlFor="password">Şifre</label>
        <input id="password" type="password" required minLength={6} autoComplete="new-password" className="input" value={form.password} onChange={set("password")} />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} {role === "business" ? "İşletme Hesabı Aç" : "Hesap Aç"}
      </button>
      <p className="text-center text-xs leading-relaxed text-ink-3">
        Hesap açarak <Link href="/yasal/kullanim-kosullari" className="underline underline-offset-2 hover:text-ink">hizmet şartlarını</Link> kabul
        etmiş olursunuz. Kişisel verileriniz <Link href="/yasal/gizlilik" className="underline underline-offset-2 hover:text-ink">Gizlilik ve KVKK
        metnine</Link> göre işlenir.
      </p>
      <p className="text-center text-sm text-ink-3">
        Zaten hesabın var mı?{" "}
        <Link href="/giris" className="font-medium text-brand-300 hover:underline">Giriş yap</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/sifre-yenile`,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-12 text-brand-300" />
        <p className="mt-3 text-sm text-ink-2">
          <b>{email}</b> adresine şifre yenileme bağlantısı gönderdik. Bağlantıyı bu cihazda açın.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-2">Hesabınızın e-posta adresini girin, size şifre yenileme bağlantısı gönderelim.</p>
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Bağlantı Gönder
      </button>
      <p className="text-center text-sm">
        <Link href="/giris" className="font-medium text-brand-300 hover:underline">Girişe dön</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(
        error.message.includes("session") ? "Bağlantının süresi dolmuş. Lütfen yeni bir bağlantı isteyin." : errorMessage(error),
      );
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    router.replace(profile?.role === "business" ? "/panel" : "/hesabim");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Yeni şifre</label>
        <input id="password" type="password" required minLength={6} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && (
        <p className="text-sm text-rose-400">
          {error} <Link href="/sifremi-unuttum" className="underline">Yeni bağlantı iste</Link>
        </p>
      )}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Şifreyi Kaydet
      </button>
    </form>
  );
}
