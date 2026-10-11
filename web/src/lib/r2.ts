import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  // Cloudflare panelindeki adres sonunda bucket adını taşıyabiliyor ("/siftahgo"); kalırsa dosyalar
  // "siftahgo/..." altına yazılır ve herkese açık adres 404 verir. Yalnızca kök adres kullanılır.
  endpoint: new URL(process.env.CLOUDFLARE_R2_ENDPOINT!).origin,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

/** Dosyayı R2'ye yükler ve herkese açık adresini döndürür. */
export async function uploadToR2(key: string, body: Uint8Array, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
}
