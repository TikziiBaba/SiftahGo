"use client";

import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { errorMessage } from "@/lib/format";

/** Müşterinin puan (1-5) ve isteğe bağlı yorum yazdığı form. `submit` ilgili add_*review çağrısını yapar. */
export function ReviewForm({
  submit,
  onDone,
}: {
  submit: (rating: number, comment: string) => PromiseLike<{ error: { message?: string; code?: string } | null }>;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Lütfen puan verin.");
    setBusy(true);
    const { error } = await submit(rating, comment);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
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
      {error && <p className="text-sm text-bad">{error}</p>}
      <button disabled={busy} className="btn btn-primary">
        {busy && <Loader2 className="size-4 animate-spin" />} Gönder
      </button>
    </form>
  );
}
