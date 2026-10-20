import type { Viewport } from "next";
import { CustomerTabBar } from "@/components/customer-tabbar";

// Müşteri sayfaları açık temada (göz yormayan açık gri zemin). İşletme tanıtımı (/esnaf), panel ve yönetim koyu kalır.
export const viewport: Viewport = {
  themeColor: "#f4f6f6",
};

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="theme-light flex min-h-full flex-1 flex-col bg-bg text-ink">
      {children}
      <CustomerTabBar />
    </div>
  );
}
