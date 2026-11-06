"use client";

import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";

/**
 * Telefonda işletme sayfasında aşağı kaydırınca beliren "Randevu al": baştaki buton ekrandan çıkınca randevu kutusuna
 * tek dokunuşla dönülür. Randevu kutusu görünürken gizlenir. Alt sekme çubuğunun üstünde durur; çerez bandı açıkken çıkmaz.
 */
export function StickyBooking() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById("randevu");
    if (!target) return;
    let boxVisible = false;
    const update = () => setShow(!boxVisible && window.scrollY > 480);
    const observer = new IntersectionObserver(([entry]) => {
      boxVisible = entry.isIntersecting;
      update();
    });
    observer.observe(target);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <a
      href="#randevu"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className={`btn btn-primary fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-30 justify-center py-3 text-base shadow-[0_12px_40px_-12px_rgb(15_26_25/0.45)] transition duration-300 ease-spring print:hidden lg:hidden [[data-cerez=sor]_&]:hidden ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <CalendarCheck className="size-5" /> Randevu al
    </a>
  );
}
