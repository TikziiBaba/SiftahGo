import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Randevu Yönetimi`,
    short_name: SITE_NAME,
    description: "Esnaf için online randevu ve takvim yönetimi.",
    start_url: "/panel",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#0f766e",
    lang: "tr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
