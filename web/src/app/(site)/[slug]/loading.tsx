import { SiteHeader } from "@/components/site-header";
import { BusinessSkeleton } from "@/components/skeletons";

// İşletme sayfasına geçerken kapak, logo ve randevu kutusunun iskeleti.
export default function BusinessLoading() {
  return (
    <>
      <SiteHeader minimal />
      <BusinessSkeleton />
    </>
  );
}
