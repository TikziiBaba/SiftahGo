"use client";

import { useRef } from "react";

/**
 * Fareyle 3D eğilen kap. Üzerinde fareyi takip eden ışık parlaması olur.
 * Dokunmatik ekranlarda ve "hareketi azalt" ayarında eğilmez (bkz. .tilt, globals.css).
 */
export function Tilt({
  children,
  className = "",
  max = 6,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const s = ref.current.style;
    s.setProperty("--rx", `${((0.5 - py) * max * 2).toFixed(2)}deg`);
    s.setProperty("--ry", `${((px - 0.5) * max * 2).toFixed(2)}deg`);
    s.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
    s.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
    s.setProperty("--go", "1");
  }

  function onPointerLeave() {
    const s = ref.current?.style;
    if (!s) return;
    s.setProperty("--rx", "0deg");
    s.setProperty("--ry", "0deg");
    s.setProperty("--go", "0");
  }

  return (
    <div ref={ref} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className={`tilt ${className}`} style={style}>
      {children}
      <span className="tilt-glare" aria-hidden />
    </div>
  );
}
