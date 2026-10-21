import QRCode from "qrcode";

/** QR kodun koyu rengi (marka turkuazının en koyu tonu); mobildeki QrCode ile aynı. */
export const QR_COLOR = "#134e4a";

/**
 * QR kodun modülleri. Logo konacaksa en yüksek hata düzeltmesiyle (H: kodun %30'u okunamasa da çözülür) üretilir
 * ve ortadaki kare (kenarın ~%22'si) boş bırakılır; logo oraya konur. `box`: boş karenin modül cinsinden yeri, logo
 * konmayacaksa null. Boş kare her bloğun düzeltme payının en fazla ~%55'ini kullanır (3-6. sürümler için hesaplandı).
 * 7. sürümden itibaren (adres ~38 karakteri geçince) ortada hizalama deseni olduğundan logo konmaz.
 */
export function qrMatrix(value: string, withLogo: boolean) {
  let qr = QRCode.create(value, { errorCorrectionLevel: withLogo ? "H" : "M" });
  const logo = withLogo && qr.version < 7;
  if (withLogo && !logo) qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let box: { start: number; size: number } | null = null;
  if (logo) {
    // Kenar uzunluğu tek sayı; kare tam ortada dursun diye boyutu da tek sayı.
    const size = Math.round(n * 0.22) | 1;
    box = { start: (n - size) / 2, size };
  }
  const inBox = (r: number, c: number) => !!box && r >= box.start && r < box.start + box.size && c >= box.start && c < box.start + box.size;
  const dark = (r: number, c: number) => !!qr.modules.get(r, c) && !inBox(r, c);
  return { n, dark, box };
}

/** SVG yolu: her koyu modül 1x1 kare. */
export function qrPath(m: ReturnType<typeof qrMatrix>) {
  let d = "";
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return d;
}
