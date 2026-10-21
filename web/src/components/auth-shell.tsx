import { Suspense } from "react";
import { AuthHomeLink, AuthPitch, HomeLink } from "@/components/auth-pitch";
import { Logo } from "@/components/site-header";
import { Shop } from "@/components/three/shop";

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
          {/* Metin adresteki ?rol / ?davet / ?next'e göre seçilir; adres istek anında belli olur. */}
          <Suspense>
            <AuthPitch />
          </Suspense>
        </div>
      </aside>

      <div className="relative flex flex-col px-4 pb-10 pt-5 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Suspense fallback={<HomeLink href="/" />}>
            <AuthHomeLink />
          </Suspense>
        </div>

        {/* Dar ekranda küçük dükkân */}
        <div className="relative mx-auto -mb-4 h-40 w-full max-w-md lg:hidden">
          <Shop className="absolute inset-0" focus={{ x: 0, y: 0 }} narrowFocus={{ x: 0, y: 0 }} scale={1.25} tiles={4} />
        </div>

        {/* Dar ekranda ortalanmaz: form (adresteki ?next vb. okunduktan sonra) gelince kart yerinden kaymasın. */}
        <div className="mx-auto w-full max-w-md py-6 lg:my-auto lg:py-10">
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
