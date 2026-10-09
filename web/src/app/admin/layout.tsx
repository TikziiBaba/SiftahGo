import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";

export const metadata: Metadata = {
  title: "Yönetim",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Adres (usePathname, useParams) istek anında bilinir; ön çizimde bekleme göstergesi çıkar.
    <Suspense
      fallback={
        <div className="grid flex-1 place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-ink-3" />
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
