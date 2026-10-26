import { ViewTransition } from "react";

/** Panel bölümleri arası geçiş; alt menü yön verir (panel/layout.tsx). Ayrıntı: app/(site)/template.tsx. */
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "tab-forward": "tab-forward", "tab-back": "tab-back", default: "page" }}
      exit={{ "tab-forward": "tab-forward", "tab-back": "tab-back", default: "page" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
