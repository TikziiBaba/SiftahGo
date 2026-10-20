import { NextResponse } from "next/server";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";
import { isSameOrigin } from "@/lib/same-origin";

const KINDS = ["logo", "cover", "gallery"] as const;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// Dosyanın ilk baytları (konum, baytlar). Tür bilgisini istemci yazar; içerik gerçekten o görsel olmalı,
// yoksa R2'de herkese açık adresle görsel kılığında başka dosya yayınlanabilir.
const SIGNATURES: Record<string, [number, number[]][]> = {
  "image/jpeg": [[0, [0xff, 0xd8, 0xff]]],
  "image/png": [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  "image/webp": [[0, [0x52, 0x49, 0x46, 0x46]], [8, [0x57, 0x45, 0x42, 0x50]]], // RIFF....WEBP
};
const MAX_BYTES = 4 * 1024 * 1024;

// İşletme sahibinin görsel yüklemesi. Görsel R2'ye gider, adresi döner;
// adresi işletme kaydına yazmak istemcinin işidir (RLS ile korunur).
// Mobil uygulamada çerez yok; oturum "Authorization: Bearer <erişim anahtarı>" ile gelir.
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  // Çerezle gelen istek başka siteden gönderilemez; mobil uygulama çerez değil Bearer kullanır.
  if (!token && !isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek." }, { status: 403 });
  const supabase = token
    ? createTokenClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createClient();
  const { data: claims } = await supabase.auth.getClaims(token);
  const userId = claims?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Giriş yapmalısınız." }, { status: 401 });

  const { data: business } = await supabase.from("businesses").select("id").eq("owner_id", userId).maybeSingle();
  if (!business) return NextResponse.json({ error: "İşletme bulunamadı." }, { status: 403 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "Görsel en fazla 4 MB olabilir." }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const file = form.get("file");
  const kind = form.get("kind") as (typeof KINDS)[number];

  if (!(file instanceof File) || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Sadece JPG, PNG veya WEBP yükleyebilirsiniz." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Görsel en fazla 4 MB olabilir." }, { status: 400 });
  const data = new Uint8Array(await file.arrayBuffer());
  if (!SIGNATURES[file.type].every(([at, sig]) => sig.every((b, i) => data[at + i] === b))) {
    return NextResponse.json({ error: "Dosya geçerli bir görsel değil." }, { status: 400 });
  }

  const key = `businesses/${business.id}/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  try {
    const url = await uploadToR2(key, data, file.type);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("R2 yükleme hatası", e);
    return NextResponse.json({ error: "Görsel yüklenemedi, lütfen tekrar deneyin." }, { status: 500 });
  }
}
