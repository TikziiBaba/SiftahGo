import { timingSafeEqual } from "node:crypto";
import { isSameOrigin } from "@/lib/same-origin";
import { createAdminClient } from "@/lib/supabase/admin";

// Kayıt formu e-posta onayını burada bekler: bağlantı telefonda açılsa da formun açık olduğu cihazda giriş yapılır.
// Bilet (login_ticket) kaydı başlatan tarayıcıda üretilir ve hesabın kayıt verisinde durur; onaydan sonra bir kez
// giriş için tek kullanımlık bağlantı verir, sonra silinir. Kayıttan 1 saat sonra geçersizdir.
const TICKET_LIFE_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { userId?: unknown; ticket?: unknown } | null;
  const { userId, ticket } = body ?? {};
  if (typeof userId !== "string" || typeof ticket !== "string" || ticket.length < 32 || ticket.length > 64) {
    return Response.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const pending = Response.json({ confirmed: false });
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  const user = data?.user;
  const stored = user?.user_metadata?.login_ticket;
  if (error || !user?.email || typeof stored !== "string") return pending;

  const given = Buffer.from(ticket);
  const expected = Buffer.from(stored);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return pending;
  if (Date.now() - new Date(user.created_at).getTime() > TICKET_LIFE_MS) return pending;
  if (!user.email_confirmed_at) return pending;

  const { data: link, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (linkError || !link.properties?.hashed_token) {
    console.error("Kayıt sonrası giriş bağlantısı üretilemedi", linkError?.message);
    return pending;
  }
  await supabase.auth.admin.updateUserById(userId, { user_metadata: { login_ticket: null } });
  return Response.json({ confirmed: true, tokenHash: link.properties.hashed_token });
}
