"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// Three.js sadece tarayıcıda ve sayfa açıldıktan sonra yüklenir.
const ShopScene = dynamic(() => import("./shop-scene"), { ssr: false, loading: () => null });

/**
 * Sahne (Three.js indirme, kurulum, gölgelendirici derleme) telefonda saniyeler süren iş: sayfanın açılışını ve ilk
 * dokunuşu bekletmesin diye dükkân ekrana girince ve tarayıcı boşa çıkınca kurulur. Dokunmatik cihazda ayrıca ilk
 * kaydırma ya da dokunuş beklenir. Gizli kaptaki (display: none) dükkân hiç kurulmaz.
 */
export function Shop(props: ComponentProps<typeof ShopScene>) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let visible = false;
    let touched = !window.matchMedia("(pointer: coarse)").matches;
    let cancel: (() => void) | null = null;
    const events = ["scroll", "pointerdown", "keydown"] as const;

    const tryStart = () => {
      if (!visible || !touched || cancel) return;
      io.disconnect();
      events.forEach((e) => window.removeEventListener(e, onInteract));
      // Safari'de requestIdleCallback yok.
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(() => setReady(true), { timeout: 3000 });
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = setTimeout(() => setReady(true), 1500);
        cancel = () => clearTimeout(id);
      }
    };
    const onInteract = () => {
      touched = true;
      tryStart();
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        tryStart();
      },
      { rootMargin: "200px" },
    );
    io.observe(host);
    if (!touched) events.forEach((e) => window.addEventListener(e, onInteract, { passive: true, once: true }));

    return () => {
      io.disconnect();
      events.forEach((e) => window.removeEventListener(e, onInteract));
      cancel?.();
    };
  }, []);

  return ready ? <ShopScene {...props} /> : <div ref={ref} className={props.className} aria-hidden />;
}
