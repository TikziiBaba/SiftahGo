import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Logo } from "@/components/site-header";
import { Shop } from "@/components/three/shop";

const PERKS = ["7 gün ücretsiz", "1 dakikada kurulum", "Taahhüt yok"];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-[100dvh] flex-1 overflow-hidden lg:grid-cols-2">
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/15 blur-[100px]" />

      {/* Geniş ekranda 3D dükkânlı tanıtım paneli; form uzasa da ekrana sabit kalır. */}
      <aside className="relative hidden border-r border-line bg-surface/40 lg:block">
        <div className="sticky top-0 h-[100dvh] overflow-hidden">
          <div className="absolute -left-20 top-1/3 size-96 rounded-full bg-gold/10 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg to-transparent" />
          <Shop className="absolute inset-0" focus={{ x: 0, y: 0.2 }} narrowFocus={{ x: 0, y: 0.2 }} scale={1.1} tiles={6} />
          <div className="absolute left-12 top-10">
            <Logo />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-12">
            <p className="max-w-sm text-3xl font-semibold leading-tight tracking-[-0.03em]">
              Randevular düzende, <span className="text-gradient">siftah sabahtan.</span>
            </p>
            <p className="mt-3 max-w-sm text-ink-3">Müşteriniz bağlantıdan saatini seçer, siz işinize bakarsınız.</p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-3">
              {PERKS.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-brand-300" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <div className="relative flex flex-col px-4 pb-10 pt-5 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link href="/" className="btn btn-ghost -mr-3 px-3 py-2">
            <ArrowLeft className="size-4" /> Ana sayfa
          </Link>
        </div>

        {/* Dar ekranda küçük dükkân */}
        <div className="relative mx-auto -mb-4 h-40 w-full max-w-md lg:hidden">
          <Shop className="absolute inset-0" focus={{ x: 0, y: 0 }} narrowFocus={{ x: 0, y: 0 }} scale={1.25} tiles={4} />
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-6 lg:py-10">
          <div className="bezel">
            <div className="bezel-core p-6 md:p-8">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
              <div className="mt-6">
                <Suspense>{children}</Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
