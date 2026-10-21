"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

const REACH = 160; // px: sürüklenen dosya bu kadar yaklaşınca alan ona doğru çekilmeye başlar
const PULL = 10; // px: en fazla kayma

/**
 * Görsel bırakma alanı. Sayfaya dosya sürüklenince belirginleşir, imleç yaklaştıkça ona doğru hafifçe
 * çekilir; üstüne gelince "bırak" durumuna geçer. Tıklayınca (ya da klavyeyle) dosya seçtirir.
 */
export function DropZone({
  label,
  hint,
  busy,
  multiple,
  onPick,
}: {
  label: string;
  hint: string;
  busy: boolean;
  multiple?: boolean;
  onPick: (f: FileList | null) => void;
}) {
  const ref = useRef<HTMLLabelElement>(null);
  const [aware, setAware] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: number | undefined;
    function reset() {
      setAware(false);
      setOver(false);
      el.style.translate = "";
    }
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      setAware(true);
      if (!still) {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        // İmlecin alanın kenarına uzaklığı (içerideyken 0): yaklaştıkça çekim artar.
        const gap = Math.hypot(Math.max(Math.abs(dx) - r.width / 2, 0), Math.max(Math.abs(dy) - r.height / 2, 0));
        const pull = (Math.max(0, 1 - gap / REACH) * PULL) / (Math.hypot(dx, dy) || 1);
        el.style.translate = `${dx * pull}px ${dy * pull}px`;
      }
      // dragover sürükleme boyunca sürekli gelir; kesilince (bırakıldı, pencereden çıktı) alan eski haline döner.
      window.clearTimeout(timer);
      timer = window.setTimeout(reset, 150);
    }
    addEventListener("dragover", onDragOver);
    addEventListener("drop", reset);
    return () => {
      window.clearTimeout(timer);
      removeEventListener("dragover", onDragOver);
      removeEventListener("drop", reset);
    };
  }, []);

  return (
    <label
      ref={ref}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) onPick(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-6 text-center transition-[translate,scale,background-color,border-color,box-shadow] duration-300 ease-spring focus-within:ring-4 focus-within:ring-brand-400/20 ${
        over
          ? "scale-[1.02] border-brand-400 bg-brand-400/10 ring-4 ring-brand-400/10"
          : aware
            ? "border-brand-400/60 bg-brand-400/5"
            : "border-line-strong hover:bg-tint/[0.03]"
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
    >
      <span
        className={`mb-1 grid size-10 place-items-center rounded-xl bg-tint/[0.05] ring-1 ring-line transition-transform duration-300 ease-spring ${over ? "-translate-y-0.5 scale-110 text-accent" : "text-ink-2"}`}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
      </span>
      <span className="text-sm font-medium">{busy ? "Yükleniyor…" : over ? "Bırakın, yükleyelim" : aware ? "Buraya bırakın" : label}</span>
      <span className="text-xs text-ink-3">{hint}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
