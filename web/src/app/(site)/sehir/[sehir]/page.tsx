import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityListing } from "@/components/city-listing";
import { cityBusinesses, cityBySlug, listedPages } from "@/lib/city-pages";
import { slugify } from "@/lib/format";

// Cache Components en az bir değer ister: yayında işletme yoksa örnek şehir verilir.
export async function generateStaticParams() {
  const { cities } = await listedPages();
  return cities.length ? cities.map((c) => ({ sehir: slugify(c) })) : [{ sehir: "sivas" }];
}

export async function generateMetadata({ params }: PageProps<"/sehir/[sehir]">): Promise<Metadata> {
  const city = cityBySlug((await params).sehir);
  if (!city) return { title: "Şehir bulunamadı", robots: { index: false } };
  const count = (await cityBusinesses(city)).length;
  return {
    title: `${city} İşletmeleri — Online Randevu ve Kuponlar`,
    description: `${city} berber, kuaför, lokanta ve daha fazlası: puanlara bakın, online randevu alın, kuponları kullanın.`,
    alternates: { canonical: `/sehir/${slugify(city)}` },
    // Boş sayfa arama sonuçlarına girmesin.
    robots: count ? undefined : { index: false },
  };
}

export default async function CityPage({ params }: PageProps<"/sehir/[sehir]">) {
  const city = cityBySlug((await params).sehir);
  if (!city) notFound();
  return <CityListing city={city} />;
}
