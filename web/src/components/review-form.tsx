"use client";

import { useState } from "react";
import { Camera, Loader2, Star, X } from "lucide-react";
import { errorMessage } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/upload";

/**
 * Müşterinin puan (1-5), isteğe bağlı yorum ve sonuç fotoğrafı eklediği form. `submit` ilgili add_*review çağrısını yapar;
 * `photoFor` yorumun bağlı olduğu randevu ya da kupon kodudur (attach_review_photo). Fotoğraf yönetici onayından sonra görünür.
 */
export function ReviewForm({
  submit,
  onDone,
  photoFor,
}: {
  submit: (rating: number, comment: string) => PromiseLike<{ error: { message?: string; code?: string } | null }>;
  onDone: () => void;
  photoFor?: { appointmentId: string } | { claimId: string };
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Lütfen puan verin.");
    setBusy(true);
    setError("");
    try {
      // Fotoğraf önce yüklenir: yükleme olmazsa yorum gönderilmeden tekrar denenebilir.
      const url = photo && photoFor ? await uploadImage(photo, "review") : null;
      const { error } = await submit(rating, comment);
      if (error) throw error;
      if (url && photoFor) {
        const { error: photoError } = await createClient().rpc("attach_review_photo", {
          p_url: url,
          p_appointment_id: "appointmentId" in photoFor ? photoFor.appointmentId : null,
          p_claim_id: "claimId" in photoFor ? photoFor.claimId : null,
        });
        if (photoError) console.error("Yorum fotoğrafı eklenemedi", photoError.message);
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err as { message?: string }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="mt-4 w-full space-y-3 border-t border-line pt-4">
      <div className="flex gap-1" role="radiogroup" aria-label="Puan">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} yıldız`} onClick={() => setRating(i)}>
            <Star className={`size-7 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-ink-3"}`} />
          </button>
        ))}
      </div>
      <textarea rows={2} maxLength={1000} className="input" placeholder="Deneyiminizi kısaca anlatın (isteğe bağlı)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {photoFor && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {photo ? (
            <span className="chip gap-1.5">
              <Camera className="size-3.5" /> {photo.name}
              <button type="button" aria-label="Fotoğrafı kaldır" onClick={() => setPhoto(null)}>
                <X className="size-3.5" />
              </button>
            </span>
          ) : (
            <label className="btn btn-ghost cursor-pointer py-1.5 text-sm">
              <Camera className="size-4" /> Sonuç fotoğrafı ekle
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <span className="text-xs text-ink-3">İsteğe bağlı; incelendikten sonra yorumunuzla görünür.</span>
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <button disabled={busy} className="btn btn-primary">
        {busy && <Loader2 className="size-4 animate-spin" />} Gönder
      </button>
    </form>
  );
}
