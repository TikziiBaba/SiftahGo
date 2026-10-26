import { ViewTransition } from "react";

/**
 * Sayfa geçişi: şablon her gezinmede yeniden kurulur, eski sayfa çıkar, yenisi girer (düzen kalıcı olduğu için
 * animasyon burada). Alt sekmeler yön verir (customer-tabbar.tsx); diğer geçişler yumuşak belirme. Animasyonlar globals.css'te.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
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
