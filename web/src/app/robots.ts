import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Arama motorları herkese açık sayfaları tarar; hesap ve yönetim sayfaları dışarıda kalır.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/admin", "/hesabim", "/api/", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
