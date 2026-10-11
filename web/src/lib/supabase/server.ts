import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

export async function createClient() {
  // Supabase oturumu okurken Date.now() çağırır; Cache Components önceden hazırlama sırasında
  // buna izin vermez ("blocking-prerender-current-time"). Sorgular yalnızca gerçek istekte çalışsın.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component içinden çağrıldığında yazılamaz; oturumu proxy yeniler.
          }
        },
      },
    },
  );
}
