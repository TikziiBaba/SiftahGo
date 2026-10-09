import Link from "next/link";
import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import QRCode from "qrcode";
import {
  Apple,
  ArrowUpRight,
  BellRing,
  Check,
  Download,
  MessageCircle,
  Monitor,
  Play,
  QrCode,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Coin } from "@/components/three/coin";
import { Tilt } from "@/components/tilt";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  APP_LINKS,
  BASE_FEATURES,
  CATEGORIES,
  PLAN_FEATURES,
  SITE_DOMAIN,
} from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import type { Plan } from "@/lib/types";

export default function Home() {
  return (
    <>
      <Backdrop />
      <SiteHeader />
      <main className="relative">
        <Hero />
        <CategoryMarquee />
        <Features />
        <HowItWorks />
        <Audiences />
        <Suspense fallback={<div className="h-[40rem]" />}>
          <Pricing />
        </Suspense>
        <Facts />
        <Suspense fallback={<div className="h-[36rem]" />}>
          <AppDownload />
        </Suspense>
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Arka plan: ışık hüzmeleri, ızgara ve film greni                      */
/* ------------------------------------------------------------------ */
function Backdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="absolute -left-40 -top-40 size-[42rem] rounded-full bg-brand-500/[0.13] blur-[120px]" />
      <div className="absolute -right-32 top-20 size-[30rem] rounded-full bg-gold/[0.07] blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

function PrimaryCta({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group btn btn-primary py-2 pl-6 pr-2 text-base"
    >
      {children}
      <span className="btn-icon size-9">
        <ArrowUpRight className="size-4.5" />
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <section className="relative isolate overflow-x-clip">
      <GridFloor />
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-24 pt-8 md:pt-14 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
        <div className="relative z-10">
          <Reveal onLoad>
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-gold shadow-[0_0_8px_rgb(245_181_68)]" />
              Esnaf için online randevu
            </span>
          </Reveal>
          <Reveal onLoad delay={80}>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] md:text-7xl">
              Randevular düzende,
              <br />
              <span className="text-gradient">siftah sabahtan.</span>
            </h1>
          </Reveal>
          <Reveal onLoad delay={160}>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-2">
              Berberden halı sahaya, kuaförden oto yıkamaya kadar bütün esnaf
              için randevu, takvim ve müşteri defteri. Müşteriniz bağlantıdan
              saatini seçer, siz işinize bakarsınız.
            </p>
          </Reveal>
          <Reveal onLoad delay={240}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PrimaryCta href="/kayit?rol=isletme">İşletmeni aç</PrimaryCta>
              <Link
                href="/kesfet"
                className="btn btn-secondary px-6 py-3.5 text-base"
              >
                Randevu al
              </Link>
            </div>
          </Reveal>
          <Reveal onLoad delay={320}>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-3">
              {["1 dakikada kurulum", "Taahhüt yok", "Web, iOS ve Android"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-brand-300" /> {t}
                  </li>
                ),
              )}
            </ul>
          </Reveal>
        </div>

        <Reveal onLoad delay={200}>
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

/** Hero'nun altında ufka doğru akan perspektif ızgara. */
function GridFloor() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-80 overflow-hidden [mask-image:linear-gradient(to_top,black_15%,transparent)] [perspective:520px]"
      aria-hidden
    >
      <div
        className="animate-grid-flow absolute -inset-x-1/2 bottom-0 h-[220%] origin-bottom [transform:rotateX(74deg)]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(45 212 191 / 0.2) 1px, transparent 1px), linear-gradient(90deg, rgb(45 212 191 / 0.2) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />
    </div>
  );
}

function HeroVisual() {
  const rows = [
    {
      time: "09:30",
      name: "Mehmet K.",
      service: "Saç Kesimi",
      staff: "Ali Usta",
      tone: "ok",
    },
    {
      time: "10:15",
      name: "Ayşe D.",
      service: "Fön + Bakım",
      staff: "Selin",
      tone: "ok",
    },
    {
      time: "11:00",
      name: "Can Y.",
      service: "Saç + Sakal",
      staff: "Ali Usta",
      tone: "wait",
    },
  ];
  return (
    <div className="relative mx-auto h-[36rem] max-w-lg lg:h-[38rem] lg:max-w-none">
      {/* Işık ve 3D madalyon */}
      <div className="absolute right-0 top-6 -z-10 size-80 rounded-full bg-gold/10 blur-3xl" />
      <div className="absolute bottom-10 left-0 -z-10 size-72 rounded-full bg-brand-400/15 blur-3xl" />
      <Coin
        className="absolute inset-0"
        focus={{ x: 0.28, y: 0.38 }}
        scale={1.25}
        narrowFocus={{ x: 0.05, y: 0.5 }}
      />

      {/* 3D eğik randevu paneli */}
      <div className="absolute bottom-0 left-0 w-full max-w-[24rem]">
        <Tilt
          className="bezel [--bx:6deg] [--by:-8deg] lg:[--bx:9deg] lg:[--by:-16deg]"
          max={7}
        >
          <div className="bezel-core p-5 [transform-style:preserve-3d]">
            <div className="depth-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-4">
                  Bugün · Perşembe
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  4 randevu
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-4">
                  Beklenen
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-brand-300">
                  ₺1.650
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-2 [transform-style:preserve-3d]">
              {rows.map((r) => (
                <li
                  key={r.time}
                  className="depth-1 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-line"
                >
                  <span className="w-12 text-sm font-semibold tabular-nums">
                    {r.time}
                  </span>
                  <span className="h-8 w-px bg-line-strong" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-ink-3">
                      {r.service} · {r.staff}
                    </p>
                  </div>
                  <span
                    className={`chip ${r.tone === "ok" ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20" : "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20"}`}
                  >
                    {r.tone === "ok" ? "Onaylandı" : "Bekliyor"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Tilt>
      </div>

      {/* Yüzen bildirim */}
      <div className="animate-float absolute left-0 top-4 hidden w-64 sm:block">
        <div className="bezel rounded-3xl p-1 backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-[calc(1.5rem-0.25rem)] bg-surface-2/90 p-3 shadow-[inset_0_1px_1px_rgb(255_255_255/0.06)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-400/15 text-brand-300">
              <BellRing className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">Yeni randevu</p>
              <p className="truncate text-xs text-ink-3">
                Mert K. · 14:30 · Saç + Sakal
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Yüzen puan */}
      <div
        className="animate-float absolute bottom-40 right-0 hidden sm:block"
        style={{ animationDelay: "-3s" }}
      >
        <div className="bezel rounded-3xl p-1 backdrop-blur-md">
          <div className="flex items-center gap-2 rounded-[calc(1.5rem-0.25rem)] bg-surface-2/90 px-4 py-3 shadow-[inset_0_1px_1px_rgb(255_255_255/0.06)]">
            <Star className="size-4 fill-gold text-gold" />
            <span className="text-sm font-semibold">4,9</span>
            <span className="text-xs text-ink-3">müşteri puanı</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kategoriler (sonsuz kayan şerit)                                    */
/* ------------------------------------------------------------------ */
function CategoryMarquee() {
  const items = CATEGORIES.filter((c) => c.id !== "diger");
  return (
    <section className="border-y border-line py-8">
      <p className="text-center text-[10px] font-medium uppercase tracking-[0.25em] text-ink-4">
        Her sektörden esnaf için
      </p>
      <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="animate-marquee flex w-max gap-3">
          {[...items, ...items].map((c, i) => (
            <Link
              key={`${c.id}-${i}`}
              href={`/kesfet?kategori=${c.id}`}
              tabIndex={i >= items.length ? -1 : undefined}
              className="whitespace-nowrap rounded-full bg-white/[0.03] px-5 py-2.5 text-sm text-ink-2 ring-1 ring-line transition-colors duration-300 hover:bg-white/[0.07] hover:text-ink"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Özellikler (asimetrik bento)                                        */
/* ------------------------------------------------------------------ */
function SectionHead({
  eyebrow,
  title,
  text,
  id,
}: {
  eyebrow: string;
  title: React.ReactNode;
  text?: string;
  id?: string;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <span id={id} className="eyebrow scroll-mt-32">
        {eyebrow}
      </span>
      <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.03em] md:text-5xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-lg text-ink-2">{text}</p>}
    </Reveal>
  );
}

function BentoCard({
  className = "",
  delay = 0,
  title,
  text,
  children,
}: {
  className?: string;
  delay?: number;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <Tilt className="bezel h-full" max={4}>
        <div className="bezel-core flex h-full flex-col overflow-hidden p-6 md:p-7">
          <div className="flex-1">{children}</div>
          <h3 className="mt-6 text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{text}</p>
        </div>
      </Tilt>
    </Reveal>
  );
}

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-28 md:py-36">
      <SectionHead
        id="ozellikler"
        eyebrow="Özellikler"
        title={
          <>
            Defter, telefon ve hesap makinesi{" "}
            <span className="text-gradient">tek ekranda</span>
          </>
        }
        text="Randevudan ciroya, esnafın her gün uğraştığı işler sade ve hızlı."
      />

      <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-12">
        <BentoCard
          className="md:col-span-7 md:row-span-2"
          title="7/24 online randevu"
          text="Müşteriniz hizmeti, ustasını ve boş saati kendisi seçer. Siz meşgulken bile randevu gelir, telefon trafiği biter."
        >
          <BookingMock />
        </BentoCard>
        <BentoCard
          className="md:col-span-5"
          delay={80}
          title="Çakışmasız takvim"
          text="Aynı saate iki randevu verilemez. Çalışma saatleri, izinler ve tatiller hesaba katılır."
        >
          <TimelineMock />
        </BentoCard>
        <BentoCard
          className="md:col-span-5"
          delay={160}
          title="WhatsApp ile hatırlatma"
          text="Tek dokunuşla hazır mesaj: tarih, saat ve hizmet içinde. Gelmeyen müşteri azalır."
        >
          <WhatsappMock />
        </BentoCard>
        <BentoCard
          className="md:col-span-4"
          title="Ciro raporları"
          text="Günlük ciro, en çok satan hizmet, personel performansı."
        >
          <ChartMock />
        </BentoCard>
        <BentoCard
          className="md:col-span-4"
          delay={80}
          title="Müşteri defteri"
          text="Kim kaç kez geldi, ne harcadı, en son ne zaman uğradı."
        >
          <CustomersMock />
        </BentoCard>
        <BentoCard
          className="md:col-span-4"
          delay={160}
          title="Müşteri yorumları"
          text="Hizmet alan müşteri puan verir; iyi puan yeni müşteri getirir."
        >
          <ReviewMock />
        </BentoCard>
        <BentoCard
          className="md:col-span-6"
          title="QR kod ve kendi adresiniz"
          text={`${SITE_DOMAIN}/isletmeniz adresinizi Instagram’a ekleyin, QR kodu tezgâha koyun.`}
        >
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid size-24 place-items-center rounded-2xl bg-white p-2.5">
              <QrCode
                className="size-full text-black"
                style={{ strokeWidth: 1.25 }}
              />
            </div>
            <div className="min-w-0 rounded-full bg-white/[0.04] px-4 py-2 font-mono text-sm text-ink-2 ring-1 ring-line">
              {SITE_DOMAIN}/<span className="text-brand-300">usta-berber</span>
            </div>
          </div>
        </BentoCard>
        <BentoCard
          className="md:col-span-6"
          delay={80}
          title="Her cihazda"
          text="Bilgisayardan, tabletten, telefondan. iOS ve Android uygulamasıyla cebinizde."
        >
          <div className="flex items-end gap-4 text-ink-3">
            <Monitor className="size-14" />
            <Tablet className="size-11" />
            <Smartphone className="size-9 text-brand-300" />
          </div>
        </BentoCard>
      </div>
    </section>
  );
}

function BookingMock() {
  const slots = [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
  ];
  const services: [string, string, string, boolean][] = [
    ["Saç Kesimi", "30 dk", "₺300", true],
    ["Saç + Sakal", "45 dk", "₺450", false],
  ];
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {services.map(([name, dur, price, on]) => (
          <div
            key={name}
            className={`flex items-center justify-between rounded-2xl p-3.5 ring-1 ${on ? "bg-brand-400/10 ring-brand-400/40" : "bg-white/[0.02] ring-line"}`}
          >
            <div>
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-ink-3">{dur}</p>
            </div>
            <span className="text-sm font-semibold">{price}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {["Bugün", "Cum 10", "Cmt 11", "Pzt 13"].map((d, i) => (
          <span
            key={d}
            className={`rounded-xl px-3 py-2 text-xs ring-1 ${i === 1 ? "bg-ink text-bg ring-ink" : "text-ink-3 ring-line"}`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {slots.map((s, i) => (
          <span
            key={s}
            className={`rounded-lg py-2 text-center text-xs font-medium tabular-nums ring-1 ${
              i === 6
                ? "bg-brand-400 text-brand-950 ring-brand-300"
                : [2, 3, 9].includes(i)
                  ? "text-ink-4 line-through ring-line"
                  : "text-ink-2 ring-line"
            }`}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] p-2 pl-4 ring-1 ring-line">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">Cuma 10 Ekim · 13:00</p>
          <p className="truncate text-xs text-ink-3">
            Saç Kesimi · Ali Usta · ₺300
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-brand-400 px-4 py-2 text-xs font-semibold text-brand-950">
          Onayla
        </span>
      </div>
    </div>
  );
}

function TimelineMock() {
  const staff = [
    {
      name: "Ali",
      blocks: [
        [0, 18],
        [26, 22],
        [62, 30],
      ],
    },
    {
      name: "Selin",
      blocks: [
        [10, 25],
        [45, 15],
        [70, 20],
      ],
    },
    {
      name: "Murat",
      blocks: [
        [5, 12],
        [30, 30],
        [80, 15],
      ],
    },
  ];
  return (
    <div className="space-y-2.5">
      {staff.map((s, i) => (
        <div key={s.name} className="flex items-center gap-3">
          <span className="w-10 text-xs text-ink-3">{s.name}</span>
          <div className="relative h-7 flex-1 rounded-lg bg-white/[0.03] ring-1 ring-line">
            {s.blocks.map(([left, width], j) => (
              <span
                key={j}
                className={`absolute inset-y-1 rounded-md ${j === 1 && i === 1 ? "bg-gold/70" : "bg-brand-500/70"}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-between pl-[3.25rem] text-[10px] text-ink-4">
        <span>09:00</span>
        <span>13:00</span>
        <span>19:00</span>
      </div>
    </div>
  );
}

function WhatsappMock() {
  return (
    <div className="space-y-2">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 ring-1 ring-emerald-400/20">
        Merhaba Can, yarın saat 11:00 için randevunuzu hatırlatmak isteriz.
        Görüşmek üzere!
        <span className="mt-1 block text-right text-[10px] text-emerald-300/70">
          10:02 ✓✓
        </span>
      </div>
      <div className="flex max-w-[70%] items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.05] px-4 py-3 text-sm ring-1 ring-line">
        <MessageCircle className="size-4 shrink-0 text-ink-3" /> Tamam,
        geliyorum 👍
      </div>
    </div>
  );
}

function ChartMock() {
  const bars = [40, 62, 48, 75, 58, 90, 70];
  return (
    <div>
      <p className="text-2xl font-semibold tracking-tight">
        ₺12.450{" "}
        <span className="text-sm font-normal text-emerald-300">bu hafta</span>
      </p>
      <div className="mt-4 flex h-24 items-end gap-1.5 border-b border-line-strong">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-[4px] ${i === 5 ? "bg-brand-300" : "bg-brand-500/60"}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function CustomersMock() {
  return (
    <ul className="space-y-2">
      {[
        ["Mehmet K.", "14 ziyaret", "₺4.200"],
        ["Ayşe D.", "9 ziyaret", "₺3.150"],
        ["Can Y.", "6 ziyaret", "₺1.980"],
      ].map(([n, v, s]) => (
        <li
          key={n}
          className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-line"
        >
          <span className="grid size-8 place-items-center rounded-full bg-brand-400/15 text-xs font-semibold text-brand-300">
            {n.charAt(0)}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">{n}</p>
            <p className="text-xs text-ink-3">{v}</p>
          </div>
          <span className="text-sm font-medium tabular-nums">{s}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewMock() {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-line">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className="size-4 fill-gold text-gold" />
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        “Sıra beklemeden girdim, tam saatinde. Artık hep buradan alıyorum.”
      </p>
      <p className="mt-2 text-xs text-ink-4">Zeynep A.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nasıl çalışır                                                       */
/* ------------------------------------------------------------------ */
function HowItWorks() {
  const steps = [
    {
      title: "Hesabını aç",
      text: "İşletme adını, kategorini ve şehrini gir. Sayfan hemen hazır.",
    },
    {
      title: "Hizmet ve saatlerini ekle",
      text: "Fiyat, süre, ustaların ve çalışma saatlerin. Gerisini sistem hesaplar.",
    },
    {
      title: "Bağlantını paylaş",
      text: "Instagram, WhatsApp, Google ve tezgâhtaki QR kod. İlk siftah bugün.",
    },
  ];
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-28 md:py-36">
      <SectionHead
        id="nasil"
        eyebrow="Nasıl çalışır"
        title="Üç adımda dükkânın internette"
      />
      <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 120} className="relative">
            <span className="text-extrude block text-7xl font-semibold tracking-tighter [transform:perspective(500px)_rotateX(14deg)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="mt-4 h-px bg-gradient-to-r from-line-strong to-transparent" />
            <h3 className="mt-5 text-xl font-semibold tracking-tight">
              {s.title}
            </h3>
            <p className="mt-2 leading-relaxed text-ink-3">{s.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Esnaf / müşteri                                                     */
/* ------------------------------------------------------------------ */
function Audiences() {
  const sides = [
    {
      eyebrow: "Esnaf için",
      title: "Defteri bırakın, işinize odaklanın",
      items: [
        "Telefonla gelen randevuyu da tek yere girin",
        "Gelmeyenleri ve iptalleri takip edin",
        "Ustalarınızın takvimini ayrı yönetin",
        "Günlük ciroyu anında görün",
      ],
      cta: { href: "/kayit?rol=isletme", label: "İşletmeni ekle" },
      accent: true,
    },
    {
      eyebrow: "Müşteri için",
      title: "Sıra beklemek yok, aramak yok",
      items: [
        "Boş saatleri anında görün",
        "Misafir olarak veya hesapla randevu alın",
        "Takviminize ekleyin",
        "Hizmet sonrası puan verin",
      ],
      cta: { href: "/kesfet", label: "İşletme bul" },
      accent: false,
    },
  ];
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-2">
      {sides.map((s, i) => (
        <Reveal key={s.eyebrow} delay={i * 120}>
          <Tilt className="bezel h-full" max={4}>
            <div
              className={`bezel-core relative h-full overflow-hidden p-8 md:p-10 ${s.accent ? "bg-gradient-to-br from-brand-900/50 to-surface" : ""}`}
            >
              {s.accent && (
                <div className="absolute -right-20 -top-20 size-60 rounded-full bg-brand-400/20 blur-3xl" />
              )}
              <span className="eyebrow relative">{s.eyebrow}</span>
              <h3 className="relative mt-5 text-3xl font-semibold leading-tight tracking-[-0.03em]">
                {s.title}
              </h3>
              <ul className="relative mt-6 space-y-3">
                {s.items.map((t) => (
                  <li key={t} className="flex gap-3 text-ink-2">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-400/15">
                      <Check
                        className="size-3 text-brand-300"
                        style={{ strokeWidth: 2.5 }}
                      />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <Link
                href={s.cta.href}
                className={`group btn relative mt-8 py-2 pl-5 pr-1.5 ${s.accent ? "btn-primary" : "btn-secondary"}`}
              >
                {s.cta.label}
                <span className={`btn-icon ${s.accent ? "" : "bg-white/10"}`}>
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </div>
          </Tilt>
        </Reveal>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Fiyatlar (veritabanındaki plans tablosundan)                         */
/* ------------------------------------------------------------------ */
async function getPlans(): Promise<Plan[]> {
  "use cache";
  cacheLife("minutes");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const { data } = await createSupabase(url, key)
      .from("plans")
      .select("*")
      .order("sort_order");
    return (data ?? []) as Plan[];
  } catch {
    return [];
  }
}

async function Pricing() {
  const plans = await getPlans();
  if (plans.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-28 md:py-36">
      <SectionHead
        id="fiyatlar"
        eyebrow="Fiyatlar"
        title={
          <>
            İşinize göre paket,{" "}
            <span className="text-gradient">sürpriz yok</span>
          </>
        }
        text="Aylık ödeme, taahhüt yok. Müşterileriniz için randevu her zaman ücretsiz."
      />
      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {plans.map((plan, i) => {
          const popular = plan.id === "esnaf";
          return (
            <Reveal
              key={plan.id}
              delay={i * 100}
              className={popular ? "md:-mt-4" : "md:mt-4"}
            >
              <Tilt
                className={`bezel h-full ${popular ? "ring-brand-400/40" : ""}`}
                max={5}
              >
                <div
                  className={`bezel-core relative flex h-full flex-col overflow-hidden p-7 ${popular ? "bg-gradient-to-b from-brand-900/50 to-surface" : ""}`}
                >
                  {popular && (
                    <div className="absolute -right-16 -top-16 size-56 rounded-full bg-brand-400/20 blur-3xl" />
                  )}
                  <div className="relative flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {popular && (
                      <span className="eyebrow py-0.5 text-brand-200">
                        En çok tercih edilen
                      </span>
                    )}
                  </div>
                  <p className="relative mt-5">
                    <span className="text-5xl font-semibold tracking-tighter">
                      {formatPrice(plan.price)}
                    </span>
                    <span className="text-ink-3"> / ay</span>
                  </p>
                  <ul className="relative mt-7 flex-1 space-y-3 text-sm">
                    {[
                      plan.staff_limit
                        ? `${plan.staff_limit} personel`
                        : "Sınırsız personel",
                      ...BASE_FEATURES,
                    ].map((f) => (
                      <li key={f} className="flex gap-2.5 text-ink-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand-300" />{" "}
                        {f}
                      </li>
                    ))}
                    {Object.entries(PLAN_FEATURES).map(([k, label]) => {
                      const on = plan.features.includes(k);
                      return (
                        <li
                          key={k}
                          className={`flex gap-2.5 ${on ? "text-ink-2" : "text-ink-4 line-through"}`}
                        >
                          <Check
                            className={`mt-0.5 size-4 shrink-0 ${on ? "text-brand-300" : "text-ink-4"}`}
                          />{" "}
                          {label}
                        </li>
                      );
                    })}
                  </ul>
                  <Link
                    href="/kayit?rol=isletme"
                    className={`group btn relative mt-8 w-full py-2 pl-5 pr-1.5 ${popular ? "btn-primary" : "btn-secondary"}`}
                  >
                    <span className="flex-1 text-center">
                      {plan.name} ile başla
                    </span>
                    <span
                      className={`btn-icon ${popular ? "" : "bg-white/10"}`}
                    >
                      <ArrowUpRight className="size-4" />
                    </span>
                  </Link>
                </div>
              </Tilt>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Rakamlarla                                                           */
/* ------------------------------------------------------------------ */
function Facts() {
  const facts = [
    ["₺0", "kurulum ücreti"],
    ["1 dk", "hesap açma"],
    ["7/24", "online randevu"],
    ["3", "platform: web, iOS, Android"],
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[2rem] bg-line ring-1 ring-line md:grid-cols-4">
        {facts.map(([n, l], i) => (
          <Reveal key={l} delay={i * 80} className="bg-bg p-8 text-center">
            <p className="text-gradient text-4xl font-semibold tracking-tighter md:text-5xl">
              {n}
            </p>
            <p className="mt-2 text-sm text-ink-3">{l}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Mobil uygulama indirme                                               */
/* ------------------------------------------------------------------ */
async function qrSvg(text: string) {
  "use cache";
  return QRCode.toString(text, { type: "svg", margin: 0, color: { dark: "#042f2e", light: "#ffffff" } });
}

// Adres verilmemişse R2'deki app/siftahgo.apk kullanılır (yüklenmişse).
async function getApkUrl() {
  "use cache";
  cacheLife("minutes");
  if (APP_LINKS.apk) return APP_LINKS.apk;
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (!base) return null;
  const url = `${base.replace(/\/$/, "")}/app/siftahgo.apk`;
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

async function AppDownload() {
  const site = process.env.NEXT_PUBLIC_APP_URL ?? `https://${SITE_DOMAIN}`;
  const apk = await getApkUrl();
  // Telefonla okutulunca doğrudan indirsin; APK yoksa bu bölüme gelsin.
  const qr = await qrSvg(apk ?? `${site}/#uygulama`);
  const stores = [
    { href: APP_LINKS.playStore, icon: Play, small: "Google Play’den", big: "Edinin" },
    { href: APP_LINKS.appStore, icon: Apple, small: "App Store’dan", big: "İndirin" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <Reveal className="bezel">
        <div className="bezel-core relative grid items-center gap-10 overflow-hidden p-8 md:grid-cols-[1.3fr_1fr] md:p-14">
          <div className="absolute -left-24 -top-24 size-72 rounded-full bg-brand-400/15 blur-3xl" />
          <div className="relative">
            <span id="uygulama" className="eyebrow scroll-mt-32">
              <Smartphone className="size-3.5" /> Mobil uygulama
            </span>
            <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.03em] md:text-5xl">
              Randevular <span className="text-gradient">cebinizde.</span>
            </h2>
            <p className="mt-4 max-w-md text-lg text-ink-2">
              Müşteriler saniyeler içinde randevu alır, esnaf günün listesini görür, durumu değiştirir ve WhatsApp’tan hatırlatır.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {apk ? (
                <a href={apk} download className="group btn btn-primary py-2.5 pl-5 pr-1.5">
                  <Download className="size-4" /> Android için indir (APK)
                  <span className="btn-icon">
                    <ArrowUpRight className="size-4" />
                  </span>
                </a>
              ) : (
                <span className="btn btn-secondary cursor-default opacity-60">
                  <Download className="size-4" /> Android APK yakında
                </span>
              )}
              {stores.map((s) =>
                s.href ? (
                  <a
                    key={s.small}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-2xl bg-black px-4 py-2 ring-1 ring-line-strong transition hover:ring-brand-400/50"
                  >
                    <s.icon className="size-6" />
                    <span className="leading-tight">
                      <span className="block text-[10px] text-ink-3">{s.small}</span>
                      <span className="block text-sm font-semibold">{s.big}</span>
                    </span>
                  </a>
                ) : (
                  <span
                    key={s.small}
                    className="flex cursor-default items-center gap-3 rounded-2xl bg-black/40 px-4 py-2 opacity-60 ring-1 ring-line"
                    title="Yakında"
                  >
                    <s.icon className="size-6" />
                    <span className="leading-tight">
                      <span className="block text-[10px] text-ink-3">{s.small}</span>
                      <span className="block text-sm font-semibold">Yakında</span>
                    </span>
                  </span>
                ),
              )}
            </div>
            {apk && (
              <p className="mt-4 max-w-md text-xs text-ink-3">
                APK’yı açarken telefonunuz “bilinmeyen kaynak” izni isteyebilir. Uygulama mağazaya çıkınca güncellemeler oradan gelir.
              </p>
            )}
          </div>

          <div className="relative mx-auto flex flex-col items-center gap-4">
            <div
              className="size-48 rounded-3xl bg-white p-4 shadow-[0_20px_60px_-20px_rgb(45_212_191/0.5)] [&_svg]:size-full"
              role="img"
              aria-label="Uygulamayı indirmek için QR kod"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <QrCode className="size-4" /> Telefonunuzun kamerasıyla okutun
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* SSS                                                                  */
/* ------------------------------------------------------------------ */
function Faq() {
  const items = [
    [
      "Müşterilerimin uygulama indirmesi gerekiyor mu?",
      "Hayır. Müşteriniz bağlantınıza veya QR kodunuza tıklayıp tarayıcıdan randevu alır. İsteyen mobil uygulamayı da kullanabilir.",
    ],
    [
      "Telefonla gelen randevuları da girebilir miyim?",
      "Evet. Panelden “Randevu Ekle” ile saniyeler içinde girersiniz; sistem çakışmayı yine engeller.",
    ],
    [
      "Birden fazla ustam var, ayrı takvim olur mu?",
      "Her personelin kendi takvimi olur. Hangi ustanın hangi hizmeti verdiğini de seçebilirsiniz.",
    ],
    [
      "Randevu hatırlatması nasıl gidiyor?",
      "Randevunun yanındaki “WhatsApp ile hatırlat” düğmesi, tarih ve saatin yazılı olduğu hazır mesajı açar; tek dokunuşla gönderirsiniz.",
    ],
    [
      "Öğle arası, tatil ya da izin günü?",
      "Çalışma saatlerini gün gün ayarlar, izin ve tatilleri ekleyebilirsiniz. O saatlerde randevu alınamaz.",
    ],
    [
      "Ücret ne kadar, taahhüt var mı?",
      "Paketler aylıktır ve taahhüt yoktur. Her ödeme 30 gün geçerlidir; istediğiniz zaman paket değiştirebilir veya bırakabilirsiniz. Ödeme PayTR güvencesiyle kartla alınır.",
    ],
    [
      "Müşterilerim ücret ödüyor mu?",
      "Hayır. Randevu almak müşteriler için tamamen ücretsizdir.",
    ],
  ];
  return (
    <section className="mx-auto max-w-3xl px-4 py-28 md:py-36">
      <SectionHead id="sss" eyebrow="Sık sorulanlar" title="Aklınızdakiler" />
      <div className="mt-14 space-y-3">
        {items.map(([q, a], i) => (
          <Reveal key={q} delay={i * 50}>
            <details className="group rounded-2xl bg-white/[0.02] ring-1 ring-line transition-colors duration-300 open:bg-white/[0.04]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-line-strong transition-transform duration-500 ease-spring group-open:rotate-45">
                  <span className="text-lg leading-none text-ink-2">+</span>
                </span>
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-ink-3">{a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Son çağrı                                                            */
/* ------------------------------------------------------------------ */
function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-28">
      <Reveal className="bezel">
        <div className="bezel-core relative overflow-hidden px-6 py-20 text-center md:px-16 md:py-24">
          <div className="absolute left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/25 blur-3xl" />
          <div className="absolute bottom-0 right-0 size-72 translate-x-1/3 translate-y-1/3 rounded-full bg-gold/15 blur-3xl" />
          <Sparkles className="relative mx-auto size-8 text-gold" />
          <h2 className="relative mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.03em] md:text-6xl">
            Bugün başlayın,{" "}
            <span className="text-gradient">ilk randevu yarın gelsin.</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-lg text-lg text-ink-2">
            Kurulum yok, taahhüt yok. Dakikalar içinde işletme sayfanız yayında.
          </p>
          <div className="relative mt-10 flex justify-center">
            <PrimaryCta href="/kayit?rol=isletme">Hemen başla</PrimaryCta>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
