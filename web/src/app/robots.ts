import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

const disallow = ["/panel", "/admin", "/hesabim", "/api/", "/auth/"];

// Yapay zekâ asistanlarının (ChatGPT, Perplexity, Gemini, Claude) arama ve eğitim tarayıcıları.
// "*" zaten izin veriyor; adlarıyla yazmak, ileride genel kurala eklenecek bir engelin onları kesmemesi için.
const aiBots = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Applebot-Extended",
  "Bingbot",
];

// Arama motorları herkese açık sayfaları tarar; hesap ve yönetim sayfaları dışarıda kalır.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: aiBots, allow: "/", disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
