import { ImageResponse } from "next/og";
import { SITE_DOMAIN } from "@/lib/constants";
import { OgMark, OgWordmark } from "@/lib/og-brand";

// Paylaşılan bağlantılarda (WhatsApp, Instagram, X) görünen genel görsel. Kendi görselini veren sayfa (işletme kapağı) bunun yerine geçer.
export const alt = "SiftahGo — Esnaftan online randevu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(135deg, #060808 0%, #0b2624 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <OgMark size={96} />
          <OgWordmark height={60} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>Esnaftan online randevu</div>
          <div style={{ fontSize: 34, color: "#a7c4c1" }}>Berber, kuaför, güzellik salonu ve daha fazlası</div>
        </div>
        <div style={{ fontSize: 28, color: "#5eead4" }}>{SITE_DOMAIN}</div>
      </div>
    ),
    size,
  );
}
