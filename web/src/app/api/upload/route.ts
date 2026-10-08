import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";

const KINDS = ["logo", "cover", "gallery"] as const;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 4 * 1024 * 1024;

// İşletme sahibinin görsel yüklemesi. Görsel R2'ye gider, adresi döner;
// adresi işletme kaydına yazmak istemcinin işidir (RLS ile korunur).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Giriş yapmalısınız." }, { status: 401 });

  const { data: business } = await supabase.from("businesses").select("id").eq("owner_id", userId).maybeSingle();
  if (!business) return NextResponse.json({ error: "İşletme bulunamadı." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind") as (typeof KINDS)[number];

  if (!(file instanceof File) || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Sadece JPG, PNG veya WEBP yükleyebilirsiniz." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Görsel en fazla 4 MB olabilir." }, { status: 400 });

  const key = `businesses/${business.id}/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  try {
    const url = await uploadToR2(key, new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("R2 yükleme hatası", e);
    return NextResponse.json({ error: "Görsel yüklenemedi, lütfen tekrar deneyin." }, { status: 500 });
  }
}
