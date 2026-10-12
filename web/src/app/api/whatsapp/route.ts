import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp Business Platform (Meta Cloud API) webhook'u: telefon doğrulama.
// Müşteri "SiftahGo doğrulama kodum: SG123456" mesajını SiftahGo numarasına gönderir; gönderen
// numara kodun sahibi hesaba bağlanır (confirm_phone_verification). Gelen mesaj ücretsizdir,
// cevap gönderilmez. Meta > WhatsApp > Configuration > Webhook: bu adres + WHATSAPP_VERIFY_TOKEN,
// "messages" alanına abone olun.

// Meta webhook'u kaydederken doğrulama isteği gönderir.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === token) {
    return new Response(params.get("hub.challenge") ?? "");
  }
  return new Response("Forbidden", { status: 403 });
}

type WebhookBody = {
  entry?: {
    changes?: {
      value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] };
    }[];
  }[];
};

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = await request.text();
  if (!secret || !validSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = createAdminClient();
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const match = message.type === "text" ? message.text?.body?.match(/SG\s?(\d{6})/i) : null;
        if (!match || !message.from) continue;
        const { error } = await supabase.rpc("confirm_phone_verification", { p_code: `SG${match[1]}`, p_from: message.from });
        if (error) console.error("Telefon doğrulanamadı", error.message);
      }
    }
  }
  // Meta, 200 dışındaki cevaplarda aynı bildirimi tekrar gönderir.
  return new Response("OK");
}

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
