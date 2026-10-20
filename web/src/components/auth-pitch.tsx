"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

const PITCH = {
  esnaf: {
    title: (
      <>
        Randevular düzende, <span className="text-gradient">siftah sabahtan.</span>
      </>
    ),
    text: "Müşteriniz bağlantıdan saatini seçer, siz işinize bakarsınız.",
    perks: ["7 gün ücretsiz", "1 dakikada kurulum", "Taahhüt yok"],
  },
  musteri: {
    title: (
      <>
        Sıra beklemeden, <span className="text-gradient">saatini seç.</span>
      </>
    ),
    text: "Boş saatleri gör, randevunu saniyeler içinde al. Randevundan önce hatırlatma gelir.",
    perks: ["Ücretsiz randevu", "Aramak, beklemek yok", "Ertele ya da iptal et"],
  },
};

/** İşletme kaydı (?rol=isletme), esnaf davet bağlantısı (?davet=) veya panele dönüş (?next=/panel) mi. */
function useBusinessEntry() {
  const params = useSearchParams();
  return params.get("rol") === "isletme" || !!params.get("davet") || !!params.get("next")?.startsWith("/panel");
}

/** Giriş/kayıt sayfasının sol panel metni: işletme girişlerinde esnafa, diğerlerinde müşteriye. */
export function AuthPitch() {
  const { title, text, perks } = PITCH[useBusinessEntry() ? "esnaf" : "musteri"];
  return (
    <div className="absolute inset-x-0 bottom-0 p-12">
      <p className="max-w-sm text-3xl font-semibold leading-tight tracking-[-0.03em]">{title}</p>
      <p className="mt-3 max-w-sm text-ink-3">{text}</p>
      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-3">
        {perks.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Check className="size-4 text-accent" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomeLink({ href }: { href: string }) {
  return (
    <Link href={href} className="btn btn-ghost -mr-3 px-3 py-2">
      <ArrowLeft className="size-4" /> Ana sayfa
    </Link>
  );
}

/** İşletme girişlerinde esnaf ana sayfasına (/esnaf), diğerlerinde müşterininkine (/) döner. */
export function AuthHomeLink() {
  return <HomeLink href={useBusinessEntry() ? "/esnaf" : "/"} />;
}
