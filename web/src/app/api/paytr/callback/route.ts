import { verifyPaytrCallback } from "@/lib/paytr";
import { createAdminClient } from "@/lib/supabase/admin";

// PayTR "Bildirim URL": ödeme sonucu buraya gelir. PayTR panelinde
// https://ALAN-ADINIZ/api/paytr/callback olarak tanımlanmalı.
// Yanıt yalnızca düz metin "OK" olmalı; yoksa PayTR tekrar dener.
export async function POST(request: Request) {
  const form = await request.formData();
  const p = {
    merchant_oid: String(form.get("merchant_oid") ?? ""),
    status: String(form.get("status") ?? ""),
    total_amount: String(form.get("total_amount") ?? ""),
    hash: String(form.get("hash") ?? ""),
  };

  if (!verifyPaytrCallback(p)) {
    console.error("PayTR bildirimi: imza geçersiz", p.merchant_oid);
    return new Response("PAYTR notification failed: bad hash", { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } =
    p.status === "success"
      ? await supabase.rpc("activate_subscription", { p_merchant_oid: p.merchant_oid, p_total_amount: Number(p.total_amount) / 100 })
      : await supabase.rpc("fail_payment", { p_merchant_oid: p.merchant_oid });

  if (error) {
    console.error("PayTR bildirimi işlenemedi", p.merchant_oid, error.message);
    return new Response("ERROR", { status: 500 });
  }
  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
