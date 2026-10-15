import Link from "next/link";
import { cacheLife } from "next/cache";
import QRCode from "qrcode";
import { Apple, ArrowUpRight, Download, Play, QrCode, Smartphone } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { APP_LINKS, SITE_DOMAIN } from "@/lib/constants";

// Müşteri (/) ve esnaf (/esnaf) ana sayfalarının ortak parçaları.

/* ------------------------------------------------------------------ */
/* Arka plan: ışık hüzmeleri, ızgara ve film greni                      */
/* ------------------------------------------------------------------ */
export function Backdrop() {
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

export function PrimaryCta({
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

/** Hero'nun altında ufka doğru akan perspektif ızgara. */
export function GridFloor() {
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

export function SectionHead({
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

/** Müşterinin gördüğü randevu ekranının örneği: hizmet, gün ve boş saat seçimi. */
export function BookingMock() {
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
                  ? "text-ink-3 line-through ring-line"
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

export async function AppDownload() {
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
                      <span className="block text-3xs text-ink-3">{s.small}</span>
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
                      <span className="block text-3xs text-ink-3">{s.small}</span>
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
