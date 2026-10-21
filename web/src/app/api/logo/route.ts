import { createClient } from "@/lib/supabase/server";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// İşletme logosunu sitenin kendi adresinden verir: R2 CORS başlığı göndermediği için tarayıcı oradan gelen resmi
// QR PNG'sine (canvas) çizemiyor. Yalnızca R2'deki logolar getirilir; işletmenin yazdığı başka bir adrese istek atılmaz.
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");
  const supabase = await createClient();
  // Sahibi yayında olmayan kendi işletmesini de görür (RLS).
  const { data } = await supabase.from("businesses").select("logo_url").eq("slug", slug).maybeSingle();
  const logo = data?.logo_url as string | null | undefined;
  if (!base || !logo?.startsWith(`${base}/`)) return new Response(null, { status: 404 });

  const res = await fetch(logo);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !TYPES.includes(type)) return new Response(null, { status: 404 });
  return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
