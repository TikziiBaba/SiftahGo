"use client";

import { ImagePlus, Loader2 } from "lucide-react";

export function ImageButton({ label, busy, multiple, onPick }: { label: string; busy: boolean; multiple?: boolean; onPick: (f: FileList | null) => void }) {
  return (
    <label className={`btn btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
