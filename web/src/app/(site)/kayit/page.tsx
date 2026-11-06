import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/auth-forms";

export const metadata: Metadata = {
  title: "Kayıt Ol",
  description:
    "Ücretsiz SiftahGo hesabı açın: müşteri olarak randevu alın ya da işletmenizi online randevuya açın.",
};

export default function SignupPage() {
  return (
    <AuthShell title="Hesap aç" subtitle="Ücretsiz, bir dakikadan kısa sürer.">
      <SignupForm />
    </AuthShell>
  );
}
