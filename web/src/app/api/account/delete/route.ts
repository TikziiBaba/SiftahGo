import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Müşteri hesabını kalıcı olarak siler (KVKK silme hakkı). Önce veritabanı yaklaşan randevuları iptal eder ve
// yorumlardaki adı kaldırır (delete_my_account); işletme sahibinin hesabı burada silinmez, destekle kapatılır.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek." }, { status: 403 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
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
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
