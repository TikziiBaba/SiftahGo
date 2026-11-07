import { ImageResponse } from "next/og";
import { cacheLife } from "next/cache";
import { publicClient } from "@/lib/city-pages";
import { badgeLabel, categoryLabel, SITE_DOMAIN } from "@/lib/constants";
import { OgMark, OgWordmark } from "@/lib/og-brand";
import type { Business } from "@/lib/types";

// "Mahallenin gözdesi" rozeti: esnafın Instagram'da ve cam afişinde paylaştığı kare görsel (1080x1080).
// Rozet yalnızca geçerli olduğu ay (kazanıldığı aydan sonraki ay) üretilir; değilse 404.
async function getMeta(slug: string) {
  "use cache";
  cacheLife("hours");
  const { data } = await publicClient()
    .from("businesses")
    .select("slug, name, category, district, city, badge_month")
    .eq("slug", slug)
    .maybeSingle();
  return data as Pick<Business, "slug" | "name" | "category" | "district" | "city" | "badge_month"> | null;
}

export async function GET(_req: Request, ctx: RouteContext<"/[slug]/rozet">) {
  const b = await getMeta((await ctx.params).slug);
  const month = b && badgeLabel(b);
  if (!b || !month) return new Response("Bulunamadı", { status: 404 });
  const area = b.district || b.city;
  const nameSize = b.name.length > 28 ? 60 : b.name.length > 18 ? 76 : 92;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(160deg, #060808 0%, #0b2624 55%, #0f766e 100%)",
          color: "#ffffff",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <OgMark size={56} />
          <OgWordmark height={36} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 260,
              height: 260,
              borderRadius: 999,
              border: "10px solid #f5b544",
              background: "rgba(245,181,68,0.12)",
              fontSize: 150,
            }}
          >
            ★
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#f5b544", letterSpacing: -1 }}>Mahallenin gözdesi</div>
          <div style={{ fontSize: 34, color: "#a7f3d0" }}>{[area, categoryLabel(b.category), month].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: nameSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3, maxWidth: 920 }}>{b.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontSize: 28, color: "#99f6e4" }}>
          <div style={{ color: "#d1fae5" }}>Bölgesinde ayın en çok tercih edilen, yüksek puanlı işletmesi</div>
          <div>{`${SITE_DOMAIN}/${b.slug}`}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
