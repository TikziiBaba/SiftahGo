import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { CookieConsent } from "@/components/cookie-consent";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Varsayılan başlık ve açıklama müşteri ana sayfası içindir; esnaf sayfası (/esnaf) kendininkini verir.
  title: { default: `${SITE_NAME} — Berber, kuaför ve esnaftan online randevu`, template: `%s | ${SITE_NAME}` },
  description:
    "Berber, kuaför, güzellik salonu, oto yıkama, halı saha ve daha fazlasında boş saatleri görün, ücretsiz online randevu alın.",
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "tr_TR" },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#060808",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
