// Girişten sonra dönülecek adres (`?next=`) yalnızca bu sitedeki bir yol olabilir.
// "//evil.com", "/\evil.com" ve sekme/satır sonu içeren biçimler tarayıcıda başka siteye çözülür (açık yönlendirme).
const BASE = "https://siftahgo.invalid";

export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.length > 512) return null;
  // Ters bölü, kontrol karakterleri ve boşluk: tarayıcı bunları yok sayıp "//" gibi okuyabilir.
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return null;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
