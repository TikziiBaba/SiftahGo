import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Kayıt Ol" };

export default function SignupPage() {
  return (
    <AuthShell title="Hesap Aç">
      <SignupForm />
    </AuthShell>
  );
}
