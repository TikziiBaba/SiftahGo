import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Giriş Yap" };

export default function LoginPage() {
  return (
    <AuthShell title="Tekrar hoş geldiniz" subtitle="Randevularınıza ve işletme panelinize devam edin.">
      <LoginForm />
    </AuthShell>
  );
}
