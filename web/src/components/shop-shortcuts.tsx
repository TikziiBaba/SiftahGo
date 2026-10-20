"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck, Check, Globe, Heart, MessageCircle, Navigation, Phone, Share2, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { whatsappLink } from "@/lib/format";

/** Lucide'ın eski Instagram çizimi (ISC lisansı); marka ikonları kütüphaneden kaldırıldı. */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

type Shortcut = { href: string; label: string; icon: LucideIcon | typeof InstagramIcon; external?: boolean };

/** Dükkân sayfasının kısayol düğmeleri. WhatsApp, Instagram ve web sitesi paket özelliğine bağlıdır (boşsa gelmez). */
export function ShopShortcuts({
  businessId,
  slug,
  name,
  phone,
  mapsUrl,
  whatsapp,
  instagram,
  website,
}: {
  businessId: string;
  slug: string;
  name: string;
  phone: string;
  mapsUrl: string | null;
  whatsapp: string;
  instagram: string;
  website: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  // Giriş yapmış müşterinin favorisi mi; giriş yoksa false (dokununca girişe gider).
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: row } = await supabase.from("favorites").select("business_id").eq("business_id", businessId).maybeSingle();
      setFavorite(!!row);
    });
  }, [businessId]);

  async function toggleFavorite() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return router.push(`/giris?next=/${slug}`);
    const next = !favorite;
    setFavorite(next);
    const { error } = next
      ? await supabase.from("favorites").insert({ customer_id: data.user.id, business_id: businessId })
      : await supabase.from("favorites").delete().eq("business_id", businessId);
    if (error) setFavorite(!next);
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      // Kullanıcı paylaşımı iptal ederse hata fırlatır; yok sayılır.
      await navigator.share({ title: name, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const items: Shortcut[] = [
    ...(phone ? [{ href: `tel:${phone}`, label: "Ara", icon: Phone }] : []),
    ...(whatsapp ? [{ href: whatsappLink(whatsapp, `Merhaba ${name}, `), label: "WhatsApp", icon: MessageCircle, external: true }] : []),
    ...(instagram ? [{ href: `https://instagram.com/${instagram}`, label: "Instagram", icon: InstagramIcon, external: true }] : []),
    ...(mapsUrl ? [{ href: mapsUrl, label: "Yol tarifi", icon: Navigation, external: true }] : []),
    ...(website ? [{ href: website, label: "Web sitesi", icon: Globe, external: true }] : []),
  ];

  return (
    // Telefonda tek satırda yana kayar, geniş ekranda alt satıra iner.
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <a href="#randevu" className="btn btn-primary shrink-0 py-2 lg:hidden">
        <CalendarCheck className="size-4" /> Randevu al
      </a>
      {items.map((s) => (
        <a
          key={s.label}
          href={s.href}
          {...(s.external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="btn btn-secondary shrink-0 py-2"
        >
          <s.icon className="size-4 text-accent" /> {s.label}
        </a>
      ))}
      <button type="button" onClick={toggleFavorite} aria-pressed={favorite} className="btn btn-secondary shrink-0 py-2">
        <Heart className={`size-4 ${favorite ? "fill-rose-400 text-bad" : "text-accent"}`} />
        {favorite ? "Favorilerde" : "Favorilere ekle"}
      </button>
      <button type="button" onClick={share} className="btn btn-secondary shrink-0 py-2">
        {copied ? <Check className="size-4 text-accent" /> : <Share2 className="size-4 text-accent" />}
        {copied ? "Bağlantı kopyalandı" : "Paylaş"}
      </button>
    </div>
  );
}
