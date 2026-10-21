import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { QrPoster } from "@/components/qr-poster";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/constants";
import type { Business } from "@/lib/types";

export const metadata: Metadata = {
  title: "Cam afişi",
  robots: { index: false, follow: false },
};

// Cama asılacak A4 QR afişi. Panelden ve uygulamadan açılır; telefonda da yazdırılabilir ya da PDF kaydedilebilir.
// Yayındaki işletmeninki herkese açık (sayfadaki bilgilerle aynı); sahibi yayında olmayan kendi işletmesininkini de görür.
export default function PosterPage({ params }: PageProps<"/[slug]/afis">) {
  return (
    <Suspense fallback={<div className="mx-auto aspect-[210/297] w-full max-w-[210mm] animate-pulse bg-surface-2" />}>
      <PosterView params={params} />
    </Suspense>
  );
}

async function PosterView({ params }: { params: PageProps<"/[slug]/afis">["params"] }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("name, slug, logo_url, category, district, city, phone")
    .eq("slug", slug)
    .maybeSingle();
  const business = data as Pick<Business, "name" | "slug" | "logo_url" | "category" | "district" | "city" | "phone"> | null;
  if (!business) notFound();

  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-4 py-6 print:block print:p-0">
      {/* Yalnızca bu sayfa: kâğıdın tamamı afiş, kenar boşluğu yok. */}
      <style>{"@page { size: A4; margin: 0; }"}</style>
      <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/${business.slug}`} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> İşletme sayfası
        </Link>
        <PrintButton label="Yazdır / PDF kaydet" />
      </div>
      <p className="w-full max-w-[210mm] text-sm text-ink-3 print:hidden">
        A4 kâğıda yazdırın ve camınıza dışarıdan okunacak şekilde asın. Yazıcınız yoksa PDF olarak kaydedip bir kırtasiyede
        bastırabilirsiniz.
      </p>
      <div className="w-full max-w-[210mm] shadow-xl ring-1 ring-line print:max-w-none print:shadow-none print:ring-0">
        <QrPoster business={business} link={`${SITE_URL}/${business.slug}`} />
      </div>
    </main>
  );
}
