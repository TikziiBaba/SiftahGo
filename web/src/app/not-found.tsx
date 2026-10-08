import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 py-24 text-center">
        <div>
          <p className="text-6xl font-bold text-brand-300">404</p>
          <h1 className="mt-3 text-xl font-semibold">Aradığınız sayfa bulunamadı</h1>
          <p className="mt-2 text-ink-3">İşletme adresi değişmiş veya kaldırılmış olabilir.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/kesfet" className="btn btn-primary">İşletme Bul</Link>
            <Link href="/" className="btn btn-secondary">Ana Sayfa</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
