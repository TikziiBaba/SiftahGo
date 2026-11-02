import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityListing } from "@/components/city-listing";
import { categoryById, cityBusinesses, cityBySlug, listedPages, pageTitleSuffix } from "@/lib/city-pages";
import { slugify } from "@/lib/format";

// Cache Components en az bir değer ister: yayında işletme yoksa örnek sayfa verilir.
export async function generateStaticParams() {
  const { pairs } = await listedPages();
  return pairs.length ? pairs.map((p) => ({ sehir: slugify(p.city), kategori: p.category })) : [{ sehir: "sivas", kategori: "berber" }];
}

export async function generateMetadata({ params }: PageProps<"/sehir/[sehir]/[kategori]">): Promise<Metadata> {
  const { sehir, kategori } = await params;
  const city = cityBySlug(sehir);
  const category = categoryById(kategori);
  if (!city || !category) return { title: "Sayfa bulunamadı", robots: { index: false } };
  const count = (await cityBusinesses(city)).filter((b) => b.category === kategori).length;
  const suffix = pageTitleSuffix(kategori);
  return {
    title: `${city} ${category.label} — ${suffix}`,
    description: `${city} ${category.label.toLocaleLowerCase("tr")} işletmeleri: puanlar, yorumlar, çalışma saatleri ve ${suffix.toLocaleLowerCase("tr")}.`,
    alternates: { canonical: `/sehir/${sehir}/${kategori}` },
    // Boş sayfa arama sonuçlarına girmesin.
    robots: count ? undefined : { index: false },
  };
}

export default async function CityCategoryPage({ params }: PageProps<"/sehir/[sehir]/[kategori]">) {
  const { sehir, kategori } = await params;
  const city = cityBySlug(sehir);
  if (!city || !categoryById(kategori)) notFound();
  return <CityListing city={city} category={kategori} />;
}
