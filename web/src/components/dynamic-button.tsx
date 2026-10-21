"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { children: string; icon?: React.ReactNode };

/**
 * Yazısı değişince genişliği yumuşakça uyan düğme: eski yazı yukarı çıkar, yenisi alttan gelir
 * (örn. Kaydet → Kaydediliyor → Kaydedildi). İkon yazıyla birlikte değişir.
 */
export function DynamicButton({ children, icon, className = "", style, ...props }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();
  const [shown, setShown] = useState({ label: children, icon });
  const [leaving, setLeaving] = useState<typeof shown | null>(null);
  if (shown.label !== children) {
    setLeaving(shown);
    setShown({ label: children, icon });
  }

  // Görünmeyen kopya yazının genişliğini verir; düğme bu genişliğe geçişle uyar.
  useLayoutEffect(() => {
    const button = buttonRef.current!;
    const measure = measureRef.current!;
    const observer = new ResizeObserver(() => {
      const s = getComputedStyle(button);
      const edges = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"] as const;
      setWidth(Math.ceil(measure.offsetWidth + edges.reduce((sum, k) => sum + parseFloat(s[k]), 0)));
    });
    observer.observe(measure);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={buttonRef}
      {...props}
      style={{ width, ...style }}
      className={`relative overflow-hidden whitespace-nowrap transition-[width,background-color,color,transform,box-shadow] ${className}`}
    >
      <span ref={measureRef} aria-hidden className="invisible inline-flex shrink-0 items-center gap-2">
        {icon}
        {children}
      </span>
      {leaving && (
        <span aria-hidden className="dyn-out absolute inset-0 flex items-center justify-center gap-2" onAnimationEnd={() => setLeaving(null)}>
          {leaving.icon}
          {leaving.label}
        </span>
      )}
      <span key={children} className={`absolute inset-0 flex items-center justify-center gap-2 ${leaving ? "dyn-in" : ""}`}>
        {icon}
        {children}
      </span>
    </button>
  );
}
