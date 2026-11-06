import type { Metadata } from "next";
import { PanelShell } from "@/components/panel-shell";

// Sekmede genel site başlığı yerine panelin adı görünsün; panel aramaya açık değil.
export const metadata: Metadata = {
  title: "İşletme paneli",
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
