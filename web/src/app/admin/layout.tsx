import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { ShellSkeleton } from "@/components/skeletons";

export const metadata: Metadata = {
  title: "Yönetim",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Adres (usePathname, useParams) istek anında bilinir; ön çizimde yönetim ekranının iskeleti çıkar.
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
