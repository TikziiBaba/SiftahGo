"use client";

import { useRef } from "react";

/**
 * Kart kabı. Kart yerinden oynamaz; fare üzerindeyken kenar çizgisinde fareyi
 * takip eden bir ışık belirir (bkz. .glow-edge, globals.css). Dokunmatik ekranda ışık çıkmaz.
 */
export function GlowCard({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const s = ref.current.style;
    s.setProperty("--gx", `${(e.clientX - r.left).toFixed(0)}px`);
    s.setProperty("--gy", `${(e.clientY - r.top).toFixed(0)}px`);
    s.setProperty("--go", "1");
  }

  function onPointerLeave() {
    ref.current?.style.setProperty("--go", "0");
  }

  return (
    <div ref={ref} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className={`relative ${className}`} style={style}>
      {children}
      <span className="glow-edge" aria-hidden />
    </div>
  );
}
