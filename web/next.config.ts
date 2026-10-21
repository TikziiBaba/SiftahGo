import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "https://*.supabase.co";
// İşletme görselleri (logo, kapak, galeri) R2'de. Görseller yalnızca bizim kovadan yüklenir: işletmenin yazabildiği başka
// bir adres (ör. ziyaretçinin IP'sini toplayan izleme pikseli) sayfaya girmez; görsel küçültme hizmeti (next/image) de
// başkasının r2.dev kovasındaki dosyaları işlemez (kotamızı harcatamaz). Adres tanımlı değilse (yerel kurulum) r2.dev.
const r2 = process.env.CLOUDFLARE_R2_PUBLIC_URL ? new URL(process.env.CLOUDFLARE_R2_PUBLIC_URL).hostname : null;
const imageHosts = r2 ? [r2] : ["*.r2.dev"];

// İçerik güvenlik politikası. Sayfalar önceden hazırlandığı (cacheComponents) için nonce kullanılamıyor; satır içi
// betikler açık, ama dışarıdan betik yalnızca Cloudflare Turnstile'dan, bağlantı yalnızca Supabase'e yapılır.
// Çerçeveler https: PayTR ödeme ekranı 3D Secure için bankanın sayfasına geçebiliyor.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${imageHosts.map((h) => `https://${h}`).join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^https:/, "wss:")} https://challenges.cloudflare.com`,
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // R2 görselleri sayfada gösterildiği boyuta küçültülüp WebP olarak verilir (next/image). Yalnızca R2 adresleri:
  // işletmenin yazabildiği başka adresler sunucu üzerinden çekilmez.
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
    maximumRedirects: 0,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
