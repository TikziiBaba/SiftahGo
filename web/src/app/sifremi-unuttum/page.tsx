import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Şifremi Unuttum" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Şifremi unuttum" subtitle="E-posta adresinizi girin, size şifre yenileme bağlantısı gönderelim.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
