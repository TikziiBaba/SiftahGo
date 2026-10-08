import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Yeni Şifre" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Yeni Şifre Belirleyin">
      <ResetPasswordForm />
    </AuthShell>
  );
}
