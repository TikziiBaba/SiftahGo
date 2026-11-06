// Sayfa yüklenirken içeriğin şeklini gösteren iskeletler (loading.tsx ve Suspense yer tutucuları).
// Renkler --color-tint üzerinden: açık (müşteri) ve koyu (esnaf, panel) temada kendiliğinden uyar.

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-tint/[0.07] ${className}`} />;
}

export function CardGridSkeleton({ count = 6, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <Bone className="h-32 rounded-none" />
          <div className="space-y-2 p-4">
            <Bone className="h-4 w-2/3" />
            <Bone className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Yazı ağırlıklı sayfa: başlık, açıklama ve paragraflar (yasal, iletişim, şehir). */
export function PageSkeleton() {
  return (
    <main aria-busy="true" aria-label="Sayfa yükleniyor" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Bone className="h-6 w-32 rounded-full" />
      <Bone className="mt-5 h-10 w-3/4 max-w-xl" />
      <Bone className="mt-3 h-4 w-full max-w-lg" />
      <CardGridSkeleton className="mt-10" />
    </main>
  );
}

/** İşletme sayfası: kapak, logo ve ad, randevu kutusu ve yan bilgiler. */
export function BusinessSkeleton() {
  return (
    <div aria-busy="true" aria-label="İşletme sayfası yükleniyor" className="min-h-[100dvh]">
      <Bone className="mx-auto h-48 max-w-6xl rounded-none md:h-72 md:w-[calc(100%-2rem)] md:rounded-3xl" />
      <div className="relative z-10 mx-auto -mt-12 max-w-6xl px-4 md:px-8">
        <div className="flex items-start gap-4">
          <div className="size-24 shrink-0 animate-pulse rounded-3xl bg-surface-2 ring-4 ring-bg md:size-28" />
          <div className="min-w-0 flex-1 space-y-2 pt-14 md:pt-16">
            <Bone className="h-7 w-2/3 max-w-sm" />
            <Bone className="h-4 w-1/2 max-w-xs" />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Bone key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <div className="grid items-start gap-6 py-8 lg:grid-cols-[1fr_360px]">
          <div className="card space-y-3 p-5">
            <Bone className="h-5 w-40" />
            {Array.from({ length: 3 }, (_, i) => (
              <Bone key={i} className="h-16" />
            ))}
            <div className="grid grid-cols-4 gap-2 pt-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Bone key={i} className="h-10" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="card h-40 animate-pulse" />
            <div className="card h-56 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Panel ve yönetim içerik alanı: özet kartları ve bir liste. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor" className="space-y-4">
      <Bone className="h-7 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
      <div className="card space-y-3 p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

/** Panel ve yönetim kabuğu henüz kurulmamışken: kenar çubuğu, üst şerit ve içerik. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-full flex-1" aria-busy="true" aria-label="Yükleniyor">
      <aside className="hidden h-screen w-64 shrink-0 flex-col gap-3 border-r border-line bg-surface/60 p-4 md:flex">
        <Bone className="h-8 w-28" />
        <Bone className="mt-3 h-14 rounded-2xl" />
        {Array.from({ length: 8 }, (_, i) => (
          <Bone key={i} className="h-8" />
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center border-b border-line px-4 md:px-8">
          <Bone className="h-5 w-32" />
        </div>
        <div className="px-4 pt-6 md:px-8">
          <DashboardSkeleton />
        </div>
      </div>
    </div>
  );
}
