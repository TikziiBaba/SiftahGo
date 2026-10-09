import "server-only";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Resend ile e-posta gönderir. Aynı `idempotencyKey` ile 24 saat içinde tekrar
 * çağrılırsa Resend ikinci kez göndermez.
 */
export async function sendEmail(
  idempotencyKey: string,
  message: { to: string; subject: string; html: string; text: string },
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, ...message }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
