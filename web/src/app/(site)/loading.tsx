import { SiteHeader } from "@/components/site-header";
import { PageSkeleton } from "@/components/skeletons";

// Müşteri sayfalarına geçerken sayfa gelene kadar başlık ve içeriğin iskeleti görünür.
export default function SiteLoading() {
  return (
    <>
      <SiteHeader />
      <PageSkeleton />
    </>
  );
}
