import type { MetadataRoute } from "next";

// Arama motorları herkese açık sayfaları tarar; hesap ve yönetim sayfaları dışarıda kalır.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/admin", "/hesabim", "/api/", "/auth/"],
    },
  };
}
