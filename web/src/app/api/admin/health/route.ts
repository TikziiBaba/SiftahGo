import { NextResponse } from "next/server";
import { paytrConfigured, paytrTestMode } from "@/lib/paytr";
import { createClient } from "@/lib/supabase/server";

// Yönetim > Sistem: sunucu ayarlarının tanımlı olup olmadığı. Değerler değil, yalnızca var/yok döner.
export async function GET() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });

  const env = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]));
  return NextResponse.json({
    paytr: paytrConfigured(),
    paytrTestMode: paytrTestMode(),
    email: env("RESEND_API_KEY", "EMAIL_FROM"),
    r2: env("CLOUDFLARE_R2_ENDPOINT", "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET_NAME", "CLOUDFLARE_R2_PUBLIC_URL"),
    serviceRole: env("SUPABASE_SERVICE_ROLE_KEY"),
    cron: env("CRON_SECRET"),
    turnstile: env("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
