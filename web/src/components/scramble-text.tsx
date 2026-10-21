"use client";

import { useEffect, useState } from "react";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=?";
const DURATION = 900;

/** Metni karışık harflerden soldan sağa çözerek gösterir; metin değişince yeniden çözer. */
export function ScrambleText({ text, className = "" }: { text: string; className?: string }) {
  const [out, setOut] = useState(text);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let last = 0;
    let frame = requestAnimationFrame(function tick(now) {
      const progress = still ? 1 : (now - started) / DURATION;
      // Karışık harfler her karede değil, ~40 ms'de bir değişir: göz yormasın.
      if (progress >= 1 || now - last > 40) {
        last = now;
        setOut(
          [...text]
            .map((c, i) => (c === " " || progress >= 0.25 + (0.75 * (i + 1)) / text.length ? c : CHARS[Math.floor(Math.random() * CHARS.length)]))
            .join(""),
        );
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{out}</span>
    </span>
  );
}
