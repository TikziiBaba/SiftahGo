import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SITE_NAME } from "@/lib/constants";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} — Esnaf için online randevu`, template: `%s | ${SITE_NAME}` },
  description:
    "Berber, kuaför, güzellik salonu, oto yıkama, halı saha ve tüm esnaf için ücretsiz online randevu ve takvim yönetimi.",
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
