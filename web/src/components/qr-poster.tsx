import { categoryLabel, SITE_DOMAIN, SITE_NAME } from "@/lib/constants";
import { QR_COLOR, qrMatrix, qrPath } from "@/lib/qr";
import type { Business } from "@/lib/types";

type PosterBusiness = Pick<Business, "name" | "slug" | "logo_url" | "category" | "district" | "city" | "phone">;

/** Bağlantının QR kodu (SVG; baskıda keskin). Logo verilirse ortaya yuvarlatılmış kare içinde konur. */
export function QrSvg({ value, logo, className }: { value: string; logo?: string | null; className?: string }) {
  const m = qrMatrix(value, !!logo);
  const q = 2; // kenar boşluğu (modül)
  const side = m.n + q * 2;
  const pad = 0.6; // logonun boş karenin kenarından uzaklığı (modül)
  return (
    <svg viewBox={`${-q} ${-q} ${side} ${side}`} className={className} role="img" aria-label="QR kod" shapeRendering="crispEdges">
      <rect x={-q} y={-q} width={side} height={side} fill="#fff" />
      <path d={qrPath(m)} fill={QR_COLOR} />
      {logo && m.box && (
        <>
          <clipPath id={`qr-logo-${m.n}`}>
            <rect x={m.box.start + pad} y={m.box.start + pad} width={m.box.size - pad * 2} height={m.box.size - pad * 2} rx={1.2} />
          </clipPath>
          <image
            href={logo}
            x={m.box.start + pad}
            y={m.box.start + pad}
            width={m.box.size - pad * 2}
            height={m.box.size - pad * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#qr-logo-${m.n})`}
          />
        </>
      )}
    </svg>
  );
}

const STEPS = ["Kodu okutun", "Saati seçin", "Randevunuz hazır"];

/**
 * Cama asılacak A4 afiş. Ölçüler afiş genişliğine göre (cqw) verildiği için ekrandaki küçük önizlemede de baskıda
 * da (210 x 297 mm) aynı görünür. Koyu bant ve renkler baskıda da çıksın diye print-color-adjust: exact.
 */
export function QrPoster({ business: b, link }: { business: PosterBusiness; link: string }) {
  const place = [b.district, b.city].filter(Boolean).join(", ");
  return (
    <div className="@container relative flex aspect-[210/297] w-full flex-col overflow-hidden bg-white text-[#0b2e2b] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:aspect-auto print:h-[297mm] print:w-[210mm]">
      <header className="flex items-center gap-[4cqw] bg-[#134e4a] px-[7cqw] py-[5cqw] text-white">
        {b.logo_url ? (
          <img src={b.logo_url} alt="" className="size-[13cqw] shrink-0 rounded-[3cqw] bg-white object-cover" />
        ) : (
          <span className="grid size-[13cqw] shrink-0 place-items-center rounded-[3cqw] bg-[#2dd4bf] text-[7cqw] font-bold text-[#134e4a]">
            {b.name.charAt(0).toLocaleUpperCase("tr")}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[6.6cqw] font-bold leading-[1.05] tracking-tight [overflow-wrap:anywhere]">{b.name}</p>
          <p className="mt-[1cqw] text-[3.2cqw] text-[#99f6e4]">{[categoryLabel(b.category), place].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-evenly px-[7cqw] text-center">
        <div>
          <p className="inline-block rounded-full bg-[#ccfbf1] px-[3cqw] py-[0.9cqw] text-[2.6cqw] font-semibold uppercase tracking-[0.25em] text-[#115e59]">
            Online randevu
          </p>
          <p className="mt-[2cqw] text-[6.6cqw] font-extrabold leading-[1.04] tracking-tight">
            Sıra beklemeyin,
            <br />
            randevunuzu alın.
          </p>
        </div>

        <div>
          <div className="rounded-[4cqw] border-[length:0.7cqw] border-[#134e4a] p-[2.2cqw]">
            <QrSvg value={link} logo={b.logo_url} className="block size-[44cqw]" />
          </div>
          <p className="mt-[2.5cqw] text-[3.4cqw] font-semibold">Telefonunuzun kamerasını koda tutun</p>
        </div>

        <ol className="grid w-full grid-cols-3 gap-[3cqw]">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-[1.5cqw]">
              <span className="grid size-[7cqw] place-items-center rounded-full bg-[#2dd4bf] text-[3.6cqw] font-bold text-[#134e4a]">{i + 1}</span>
              <span className="text-[3cqw] font-medium leading-tight">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <footer className="flex items-end justify-between gap-[4cqw] border-t-[length:0.4cqw] border-[#ccfbf1] px-[7cqw] py-[3.5cqw]">
        <div className="min-w-0">
          <p className="text-[4cqw] font-bold [overflow-wrap:anywhere]">
            {SITE_DOMAIN}/{b.slug}
          </p>
          {b.phone && <p className="mt-[0.8cqw] text-[3.2cqw] text-[#115e59]">Telefon: {b.phone}</p>}
        </div>
        <p className="shrink-0 text-right text-[2.6cqw] leading-snug text-[#115e59]">
          7/24 online randevu
          <br />
          <b className="text-[3.2cqw] text-[#134e4a]">{SITE_NAME}</b>
        </p>
      </footer>
    </div>
  );
}
