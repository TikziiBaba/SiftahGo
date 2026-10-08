"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2, MailCheck, Store, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("hata") ? "Doğrulama bağlantısı geçersiz veya süresi dolmuş." : "");

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
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    router.replace(safeNext(params.get("next")) ?? (profile?.role === "business" ? "/panel" : "/hesabim"));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0" htmlFor="password">Şifre</label>
          <Link href="/sifremi-unuttum" className="text-sm text-brand-700 hover:underline">Şifremi unuttum</Link>
        </div>
        <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Giriş Yap
      </button>
      <p className="text-center text-sm text-stone-500">
        Hesabın yok mu?{" "}
        <Link href="/kayit" className="font-medium text-brand-700 hover:underline">Kayıt ol</Link>
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
        <MailCheck className="mx-auto size-12 text-brand-700" />
        <h2 className="mt-3 text-lg font-semibold">E-postanızı kontrol edin</h2>
        <p className="mt-2 text-sm text-stone-600">
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
              role === value ? "border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-100" : "border-stone-200 text-stone-600"
            }`}
          >
            <Icon className="size-5" /> {text}
          </button>
        ))}
      </div>
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
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} {role === "business" ? "İşletme Hesabı Aç" : "Hesap Aç"}
      </button>
      <p className="text-center text-sm text-stone-500">
        Zaten hesabın var mı?{" "}
        <Link href="/giris" className="font-medium text-brand-700 hover:underline">Giriş yap</Link>
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
        <MailCheck className="mx-auto size-12 text-brand-700" />
        <p className="mt-3 text-sm text-stone-600">
          <b>{email}</b> adresine şifre yenileme bağlantısı gönderdik. Bağlantıyı bu cihazda açın.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-stone-600">Hesabınızın e-posta adresini girin, size şifre yenileme bağlantısı gönderelim.</p>
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Bağlantı Gönder
      </button>
      <p className="text-center text-sm">
        <Link href="/giris" className="font-medium text-brand-700 hover:underline">Girişe dön</Link>
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
        <p className="text-sm text-rose-600">
          {error} <Link href="/sifremi-unuttum" className="underline">Yeni bağlantı iste</Link>
        </p>
      )}
      <button disabled={busy} className="btn btn-primary w-full py-3">
        {busy && <Loader2 className="size-4 animate-spin" />} Şifreyi Kaydet
      </button>
    </form>
  );
}
