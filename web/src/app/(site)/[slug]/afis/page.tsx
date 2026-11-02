import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { QrPoster } from "@/components/qr-poster";
import { createClient } from "@/lib/supabase/server";
import { isShowcase, SITE_URL } from "@/lib/constants";
import type { Business } from "@/lib/types";

export const metadata: Metadata = {
  title: "Cam afişi",
  robots: { index: false, follow: false },
};

// Cama asılacak QR afişi: A3, istenirse A4 (?boyut=a4). Panelden ve uygulamadan açılır; telefonda da yazdırılabilir ya da PDF kaydedilebilir.
// Yayındaki işletmeninki herkese açık (sayfadaki bilgilerle aynı); sahibi yayında olmayan kendi işletmesininkini de görür.
export default function PosterPage({ params, searchParams }: PageProps<"/[slug]/afis">) {
  return (
    <Suspense fallback={<div className="mx-auto aspect-[210/297] w-full max-w-[210mm] animate-pulse bg-surface-2" />}>
      <PosterView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const SIZES = {
  a3: { label: "A3", width: "297mm", height: "420mm", hint: "A3 çoğu ev yazıcısında yoktur: PDF olarak kaydedip bir kırtasiyede bastırın." },
  a4: { label: "A4", width: "210mm", height: "297mm", hint: "Normal yazıcıda basılır." },
} as const;

async function PosterView({ params, searchParams }: PageProps<"/[slug]/afis">) {
  const { slug } = await params;
  const size = (await searchParams).boyut === "a4" ? "a4" : "a3";
  const paper = SIZES[size];
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("name, slug, logo_url, category, district, city, phone, business_type")
    .eq("slug", slug)
    .maybeSingle();
  const business = data as Pick<Business, "name" | "slug" | "logo_url" | "category" | "district" | "city" | "phone" | "business_type"> | null;
  if (!business) notFound();

  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-4 py-6 print:block print:p-0">
      {/* Yalnızca bu sayfa: kâğıdın tamamı afiş, kenar boşluğu yok. */}
      <style>{`@page { size: ${paper.label}; margin: 0; } @media print { .poster-sheet { aspect-ratio: auto; width: ${paper.width}; height: ${paper.height}; } }`}</style>
      <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/${business.slug}`} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> İşletme sayfası
        </Link>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Kâğıt boyutu" className="flex rounded-full bg-surface p-1 text-sm ring-1 ring-line">
            {(["a3", "a4"] as const).map((s) => (
              <Link
                key={s}
                href={s === "a3" ? `/${business.slug}/afis` : `/${business.slug}/afis?boyut=a4`}
                scroll={false}
                aria-current={s === size ? "true" : undefined}
                className={`rounded-full px-3.5 py-1.5 font-medium ${s === size ? "bg-brand-400/12 text-accent" : "text-ink-3 hover:text-ink"}`}
              >
                {SIZES[s].label}
              </Link>
            ))}
          </div>
          <PrintButton label="Yazdır / PDF kaydet" />
        </div>
      </div>
      <p className="w-full max-w-[210mm] text-sm text-ink-3 print:hidden">
        {paper.label} kâğıda yazdırın ve camınıza dışarıdan okunacak şekilde asın. {paper.hint} Yazdırırken kâğıt boyutunun {paper.label} seçili
        olduğuna bakın.
      </p>
      <div className="w-full max-w-[210mm] shadow-xl ring-1 ring-line print:max-w-none print:shadow-none print:ring-0">
        <QrPoster business={business} link={`${SITE_URL}/${business.slug}`} showcase={isShowcase(business)} />
      </div>
    </main>
  );
}
