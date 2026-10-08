/** Görseli tarayıcıda küçültüp /api/upload üzerinden R2'ye yükler, adresini döndürür. */
export async function uploadImage(file: File, kind: "logo" | "cover" | "gallery") {
  const blob = await shrink(file, kind === "logo" ? 512 : 1600);
  const body = new FormData();
  body.append("file", new File([blob], "image.jpg", { type: "image/jpeg" }));
  body.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Görsel yüklenemedi.");
  return json.url as string;
}

async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG saydamlık desteklemez
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Görsel işlenemedi."))), "image/jpeg", 0.85),
  );
}
