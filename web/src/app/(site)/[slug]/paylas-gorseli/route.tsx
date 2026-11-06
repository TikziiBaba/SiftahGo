import { ImageResponse } from "next/og";
import { cacheLife } from "next/cache";
import { publicClient } from "@/lib/city-pages";
import { categoryLabel, isShowcase, menuLabel, SITE_DOMAIN } from "@/lib/constants";
import { OgMark, OgWordmark } from "@/lib/og-brand";
import type { Business } from "@/lib/types";

// Kapak fotoğrafı olmayan işletmenin bağlantısı WhatsApp'ta görselsiz kalmasın: adı, türü ve yeri yazan paylaşım görseli.
// Kapak varsa sayfa onu kullanır (page.tsx generateMetadata).
async function getMeta(slug: string) {
  "use cache";
  cacheLife("hours");
  const { data } = await publicClient()
    .from("businesses")
    .select("slug, name, category, district, city, business_type")
    .eq("slug", slug)
    .maybeSingle();
  return data as Pick<Business, "slug" | "name" | "category" | "district" | "city" | "business_type"> | null;
}

export async function GET(_req: Request, ctx: RouteContext<"/[slug]/paylas-gorseli">) {
  const b = await getMeta((await ctx.params).slug);
  if (!b) return new Response("Bulunamadı", { status: 404 });
  const place = [b.district, b.city].filter(Boolean).join(", ");
  const kind = [categoryLabel(b.category), place].filter(Boolean).join(" · ");
  const action = isShowcase(b) ? `${menuLabel(b.category)}, kuponlar ve yol tarifi` : "Boş saatleri gör, online randevu al";
  // Uzun adlar iki satıra sığsın.
  const nameSize = b.name.length > 28 ? 64 : b.name.length > 18 ? 80 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #060808 0%, #0b2624 55%, #0f766e 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <OgMark size={64} />
          <OgWordmark height={40} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: nameSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>{b.name}</div>
          {kind && <div style={{ fontSize: 36, color: "#a7f3d0" }}>{kind}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <div style={{ display: "flex", padding: "14px 28px", borderRadius: 999, background: "#ffffff", color: "#0b2624", fontWeight: 700 }}>
            {action}
          </div>
          <div style={{ color: "#99f6e4" }}>{`${SITE_DOMAIN}/${b.slug}`}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
