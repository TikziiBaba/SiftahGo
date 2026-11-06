import { SiteHeader } from "@/components/site-header";
import { PageSkeleton } from "@/components/skeletons";

// Esnaf tanıtım sayfasına geçerken iskelet.
export default function EsnafLoading() {
  return (
    <>
      <SiteHeader section="esnaf" />
      <PageSkeleton />
    </>
  );
}
