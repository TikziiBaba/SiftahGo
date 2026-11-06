import type { Metadata } from "next";

// Sayfa istemci bileşeni olduğu için başlık burada; hesap sayfası aramaya açık değil.
export const metadata: Metadata = {
  title: "Hesabım",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
