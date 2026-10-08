import { Suspense } from "react";
import { Logo } from "@/components/site-header";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-full flex-1 place-items-center bg-gradient-to-b from-brand-50 to-stone-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 shadow-sm md:p-8">
          <h1 className="mb-6 text-center text-xl font-bold">{title}</h1>
          <Suspense>{children}</Suspense>
        </div>
      </div>
    </main>
  );
}
