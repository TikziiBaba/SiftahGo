import { NextResponse } from "next/server";
import { safeNext as toSafeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// E-posta doğrulama bağlantısı ve Google ile giriş buraya döner; kodu oturuma çevirir.
// `next` yoksa hesaba göre yönetim, panel veya Randevularım açılır.
// `rol=isletme`: Google ile işletme hesabı açılıyor.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = toSafeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const userId = data.user.id;
      if (searchParams.get("rol") === "isletme") {
        await supabase.from("profiles").update({ role: "business" }).eq("id", userId);
      }
      if (safeNext) return NextResponse.redirect(`${origin}${safeNext}`);
      const [{ data: profile }, { data: admin }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.rpc("is_admin"),
      ]);
      return NextResponse.redirect(`${origin}${admin === true ? "/admin" : profile?.role === "business" ? "/panel" : "/hesabim"}`);
    }
  }
  // Google'dan iptal veya hata ile dönüş (?error=...)
  if (searchParams.get("error")) return NextResponse.redirect(`${origin}/giris?hata=google`);
  return NextResponse.redirect(`${origin}/giris?hata=dogrulama`);
}
