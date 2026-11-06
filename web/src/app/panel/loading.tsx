import { DashboardSkeleton } from "@/components/skeletons";

// Panel bölümleri arasında geçerken kenar çubuğu yerinde kalır, içerik alanında iskelet görünür.
export default function PanelLoading() {
  return <DashboardSkeleton />;
}
