import { Suspense } from "react";
import { Logo } from "@/components/site-header";
import { Coin } from "@/components/three/coin";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-[100dvh] flex-1 overflow-hidden lg:grid-cols-2">
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/15 blur-[100px]" />

      {/* Geniş ekranda 3D madalyonlu tanıtım paneli */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface/40 lg:block">
        <div className="absolute -left-20 top-1/3 size-96 rounded-full bg-gold/10 blur-3xl" />
        <Coin className="absolute inset-0" focus={{ x: 0, y: 0.12 }} narrowFocus={{ x: 0, y: 0.12 }} scale={1.1} tiles={6} />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <p className="max-w-sm text-3xl font-semibold leading-tight tracking-[-0.03em]">
            Randevular düzende, <span className="text-gradient">siftah sabahtan.</span>
          </p>
          <p className="mt-3 max-w-sm text-ink-3">Müşteriniz bağlantıdan saatini seçer, siz işinize bakarsınız.</p>
        </div>
      </aside>

      <div className="relative grid place-items-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Logo size="lg" />
          </div>
          <div className="bezel">
            <div className="bezel-core p-6 md:p-8">
              <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">{title}</h1>
              <Suspense>{children}</Suspense>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
