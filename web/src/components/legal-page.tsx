import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { LEGAL_DOCS, LEGAL_UPDATED } from "@/lib/company";

/** Yasal metinlerin ve iletişim sayfasının ortak iskeleti: solda belge listesi, sağda metin. */
export function LegalPage({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 pb-24 pt-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Yasal metinler" className="md:sticky md:top-28 md:self-start">
          <ul className="flex flex-wrap gap-2 md:flex-col md:gap-1">
            {LEGAL_DOCS.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  aria-current={d.href === href ? "page" : undefined}
                  className={`block rounded-full px-3 py-1.5 text-sm transition-colors duration-300 md:rounded-xl ${
                    d.href === href ? "bg-brand-400/10 text-accent-strong ring-1 ring-brand-400/20" : "text-ink-3 ring-1 ring-line hover:text-ink md:ring-0 md:hover:bg-tint/[0.04]"
                  }`}
                >
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-ink-3">Son güncelleme: {LEGAL_UPDATED}</p>
          <div className="legal mt-8">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
