"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, MailCheck, Phone, Store, User, type LucideIcon } from "lucide-react";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";
import { createClient } from "@/lib/supabase/client";
import { REFERRAL_KEY } from "@/lib/constants";
import { errorMessage } from "@/lib/format";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { id: string };

/** Solunda ikon olan giriş alanı; `type="password"` ise göster/gizle düğmesi eklenir. */
function Field({ label, icon: Icon, aside, ...input }: InputProps & { label: string; icon: LucideIcon; aside?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const isPassword = input.type === "password";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="label mb-0" htmlFor={input.id}>{label}</label>
        {aside}
      </div>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input {...input} type={isPassword && show ? "text" : input.type} className={`input py-3 pl-10 ${isPassword ? "pr-11" : ""}`} />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 transition hover:bg-white/[0.05] hover:text-ink"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Bot kontrolü token'ı. Token tek kullanımlık: her denemeden sonra `retry` ile yenilenir. */
function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  return {
    token: token ?? undefined,
    ready: !turnstileEnabled || !!token,
    widget: <Turnstile key={key} onToken={setToken} />,
    retry: () => {
      setToken(null);
      setKey((k) => k + 1);
    },
  };
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
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
      {error && <div className="mt-2"><FormError>{error}</FormError></div>}
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
  const captcha = useCaptcha();
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha.token } });
    if (error) {
      setBusy(false);
      captcha.retry();
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
      <Field id="email" label="E-posta" icon={Mail} type="email" required autoComplete="email" placeholder="ornek@eposta.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field
        id="password"
        label="Şifre"
        icon={Lock}
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aside={<Link href="/sifremi-unuttum" className="text-sm text-brand-300 hover:underline">Şifremi unuttum</Link>}
      />
      {captcha.widget}
      {error && <FormError>{error}</FormError>}
      <button disabled={busy || !captcha.ready} className="btn btn-primary w-full py-3">
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
  // Davet bağlantısı (?davet=KOD) esnaftan esnafa gelir: işletme hesabı seçili açılır, kod kurulum için saklanır.
  const [role, setRole] = useState<"customer" | "business">(params.get("rol") === "isletme" || params.get("davet") ? "business" : "customer");

  useEffect(() => {
    const code = params.get("davet");
    if (!code) return;
    try {
      localStorage.setItem(REFERRAL_KEY, code.trim().toUpperCase());
    } catch {}
  }, [params]);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const captcha = useCaptcha();

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
        captchaToken: captcha.token,
      },
    });
    setBusy(false);
    if (error) {
      captcha.retry();
      return setError(errorMessage(error));
    }
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
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Hesap türü">
        {([
          ["customer", "Müşteriyim", "Randevu almak istiyorum", User],
          ["business", "İşletmem var", "Randevu vermek istiyorum", Store],
        ] as const).map(([value, text, hint, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => setRole(value)}
            className={`flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition duration-300 ease-spring ${
              role === value ? "border-brand-400/60 bg-brand-400/10 ring-4 ring-brand-400/10" : "border-line hover:border-line-strong hover:bg-white/[0.02]"
            }`}
          >
            <span className={`grid size-8 place-items-center rounded-lg ${role === value ? "bg-brand-400 text-brand-950" : "bg-white/[0.05] text-ink-2"}`}>
              <Icon className="size-4" />
            </span>
            <span>
              <span className={`block text-sm font-medium ${role === value ? "text-ink" : "text-ink-2"}`}>{text}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-3">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <GoogleButton next={target} business={role === "business"} />
      <Field id="full_name" label="Ad Soyad" icon={User} required autoComplete="name" value={form.full_name} onChange={set("full_name")} />
      <Field id="phone" label="Telefon" icon={Phone} type="tel" autoComplete="tel" placeholder="05xx xxx xx xx" value={form.phone} onChange={set("phone")} />
      <Field id="email" label="E-posta" icon={Mail} type="email" required autoComplete="email" placeholder="ornek@eposta.com" value={form.email} onChange={set("email")} />
      <Field id="password" label="Şifre" icon={Lock} type="password" required minLength={6} autoComplete="new-password" placeholder="En az 6 karakter" value={form.password} onChange={set("password")} />
      {captcha.widget}
      {error && <FormError>{error}</FormError>}
      <button disabled={busy || !captcha.ready} className="btn btn-primary w-full py-3">
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
  const captcha = useCaptcha();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/sifre-yenile`,
      captchaToken: captcha.token,
    });
    setBusy(false);
    if (error) {
      captcha.retry();
      return setError(errorMessage(error));
    }
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
      <Field id="email" label="E-posta" icon={Mail} type="email" required autoComplete="email" placeholder="ornek@eposta.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      {captcha.widget}
      {error && <FormError>{error}</FormError>}
      <button disabled={busy || !captcha.ready} className="btn btn-primary w-full py-3">
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
      <Field id="password" label="Yeni şifre" icon={Lock} type="password" required minLength={6} autoComplete="new-password" placeholder="En az 6 karakter" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && (
        <FormError>
          {error} <Link href="/sifremi-unuttum" className="underline">Yeni bağlantı iste</Link>
        </FormError>
      )}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Şifreyi Kaydet
      </button>
    </form>
  );
}
