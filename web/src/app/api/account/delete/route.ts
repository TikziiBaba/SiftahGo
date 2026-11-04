import { NextResponse } from "next/server";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import { isSameOrigin } from "@/lib/same-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Müşteri hesabını kalıcı olarak siler (KVKK silme hakkı). Önce veritabanı yaklaşan randevuları iptal eder ve
// yorumlardaki adı kaldırır (delete_my_account); işletme sahibinin hesabı burada silinmez, destekle kapatılır.
// Mobil uygulamada çerez yok; oturum "Authorization: Bearer <erişim anahtarı>" ile gelir (api/upload ile aynı).
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token && !isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek." }, { status: 403 });
  const supabase = token
    ? createTokenClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createClient();
  const { data: auth } = await supabase.auth.getUser(token);
  if (!auth.user) return NextResponse.json({ error: "Giriş yapmalısınız." }, { status: 401 });

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    if (error.code !== "P0001") console.error("Hesap silme hazırlığı", error.message);
    return NextResponse.json(
      { error: error.code === "P0001" ? error.message : "Hesap şu an silinemedi. Lütfen destek adresimize yazın." },
      { status: 400 },
    );
  }
  const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(auth.user.id);
  if (deleteError) {
    console.error("Hesap silinemedi", deleteError.message);
    return NextResponse.json({ error: "Hesap şu an silinemedi. Lütfen destek adresimize yazın." }, { status: 500 });
  }
  if (!token) await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
