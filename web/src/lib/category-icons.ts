import { createElement } from "react";
import {
  Camera,
  Droplets,
  Dumbbell,
  Flower2,
  Goal,
  GraduationCap,
  Hand,
  LayoutGrid,
  PawPrint,
  PenTool,
  Scissors,
  Shirt,
  Sparkles,
  Stethoscope,
  Wind,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { CATEGORIES } from "@/lib/constants";

// Kategori ikonları. Liste constants.ts'teki CATEGORIES'ten gelir (mobil ile aynı tutulur).
export const CATEGORY_ICONS: Record<(typeof CATEGORIES)[number]["id"], LucideIcon> = {
  berber: Scissors,
  kuafor: Wind,
  guzellik: Sparkles,
  tirnak: Hand,
  spa: Flower2,
  dovme: PenTool,
  "oto-yikama": Droplets,
  "oto-servis": Wrench,
  "hali-saha": Goal,
  spor: Dumbbell,
  veteriner: PawPrint,
  klinik: Stethoscope,
  egitim: GraduationCap,
  fotograf: Camera,
  terzi: Shirt,
  diger: LayoutGrid,
};

/** Kategorinin ikonu; boş ya da bilinmeyen kategoride ızgara ikonu. */
export function CategoryIcon({ id, ...props }: { id: string } & LucideProps) {
  return createElement(CATEGORY_ICONS[id as keyof typeof CATEGORY_ICONS] ?? LayoutGrid, props);
}
