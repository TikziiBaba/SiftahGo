import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaytrToken, paytrConfigured } from "@/lib/paytr";
import { isSameOrigin } from "@/lib/same-origin";

// İşletme sahibi bir paket için ödeme başlatır; dönen token ile PayTR iframe'i açılır.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek." }, { status: 403 });
  if (!paytrConfigured()) {
    return NextResponse.json({ error: "Online ödeme henüz yapılandırılmadı." }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Giriş yapmalısınız." }, { status: 401 });

  // months: 1 (aylık, 30 gün) veya 12 (yıllık, 365 gün; 10 ay fiyatına). Tutarı veritabanı hesaplar.
  let input: { planId?: string; months?: number };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const { planId, months = 1 } = input;
  const [{ data: pay, error }, { data: business }, { data: profile }] = await Promise.all([
    supabase.rpc("create_payment", { p_plan_id: planId, p_months: months }).single<{ merchant_oid: string; amount: number; plan_name: string }>(),
    supabase.from("businesses").select("name, phone, address, district, city").eq("owner_id", auth.user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, phone").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (error || !pay || !business) {
    // Yalnızca veritabanının bilerek verdiği Türkçe hata (raise exception) gösterilir; diğerleri ayrıntı sızdırmasın.
    if (error && error.code !== "P0001") console.error("Ödeme başlatılamadı", error.message);
    return NextResponse.json({ error: error?.code === "P0001" ? error.message : "Ödeme başlatılamadı." }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "127.0.0.1";
  const result = await getPaytrToken({
    merchantOid: pay.merchant_oid,
    amount: Number(pay.amount),
    productName: `SiftahGo ${pay.plan_name} paketi (${Number(months) === 12 ? "12 ay" : "30 gün"})`,
    email: auth.user.email ?? "",
    userIp: ip,
    userName: profile?.full_name || business.name,
    userAddress: [business.address, business.district, business.city].filter(Boolean).join(", ") || "Türkiye",
    userPhone: business.phone || profile?.phone || "0000000000",
    okUrl: `${origin}/panel/abonelik?odeme=basarili`,
    failUrl: `${origin}/panel/abonelik?odeme=hata`,
  });
  if ("error" in result) {
    console.error("PayTR token hatası", result.error);
    return NextResponse.json({ error: "Ödeme ekranı açılamadı. Lütfen tekrar deneyin." }, { status: 502 });
  }
  return NextResponse.json({ token: result.token });
}
