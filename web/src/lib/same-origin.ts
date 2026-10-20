// Çerezle kimlik doğrulanan yazma isteklerinde başka siteden gelen istek (CSRF) reddedilir.
// Tarayıcılar POST isteğinde Origin başlığını her zaman gönderir; başlık yoksa istek tarayıcıdan değildir
// (çerez sızdırılmadan CSRF yapılamaz), bu yüzden yalnızca uyuşmayan Origin reddedilir.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [new URL(request.url).origin];
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowed.push(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // Geçersiz adres yok sayılır.
    }
  }
  return allowed.includes(origin);
}
