"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Download, ImagePlus, Loader2, Printer } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { QrPoster, QrSvg } from "@/components/qr-poster";
import { isShowcase, SITE_URL } from "@/lib/constants";
import { QR_COLOR, qrMatrix } from "@/lib/qr";

export default function QrPage() {
  const { business } = useBusiness();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const url = `${SITE_URL}/${business.slug}`;

  // PNG: logo sitenin kendi adresinden alınır (R2 CORS vermediği için doğrudan çizilemez). Logo gelmezse logosuz QR iner.
  async function downloadPng() {
    setSaving(true);
    let logo: HTMLImageElement | null = null;
    if (business.logo_url) {
      const img = new Image();
      img.src = `/api/logo?slug=${encodeURIComponent(business.slug)}`;
      logo = await img.decode().then(() => img, () => null);
    }
    const m = qrMatrix(url, !!logo);
    const q = 2;
    const cell = Math.floor(1200 / (m.n + q * 2));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = (m.n + q * 2) * cell;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = QR_COLOR;
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) ctx.fillRect((c + q) * cell, (r + q) * cell, cell, cell);
    if (logo && m.box) {
      const pad = cell * 0.6;
      const x = (m.box.start + q) * cell + pad;
      const size = m.box.size * cell - pad * 2;
      // Logo kareye kırpılır (object-fit: cover gibi), köşeleri yuvarlatılır.
      const s = Math.min(logo.naturalWidth, logo.naturalHeight);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, x, size, size, cell * 1.2);
      ctx.clip();
      ctx.drawImage(logo, (logo.naturalWidth - s) / 2, (logo.naturalHeight - s) / 2, s, s, x, x, size, size);
      ctx.restore();
    }
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${business.slug}-qr.png`;
    a.click();
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">QR, bağlantılar ve afiş</h1>
      <p className="text-sm text-ink-3">
        Afişi yazdırıp camınıza asın; bağlantınızı Instagram, Google ve web sitenize ekleyin.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_minmax(0,360px)]">
        <section className="card flex flex-col items-center p-8 text-center">
          <p className="text-2xl font-bold">{business.name}</p>
          <p className="mt-1 text-ink-3">{isShowcase(business) ? "Menü ve kuponlar için kodu okutun" : "Randevu almak için kodu okutun"}</p>
          <div className="mt-6 rounded-2xl bg-white p-3">
            <QrSvg value={url} logo={business.logo_url} className="block size-60" />
          </div>
          <p className="mt-4 font-mono text-sm">{url}</p>
          {!business.logo_url && (
            <Link href="/panel/ayarlar" className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <ImagePlus className="size-4" /> Logonuzu ekleyin, QR kodun ortasında görünsün
            </Link>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              className="btn btn-secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="size-4" /> {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
            </button>
            <button className="btn btn-secondary" disabled={saving} onClick={downloadPng}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PNG indir
            </button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Cam afişi</h2>
          <p className="mt-1 text-sm text-ink-3">A3 boyutunda, isterseniz A4; işletmenize özel. Yazdırıp camınıza dışarıdan okunacak şekilde asın.</p>
          <div className="mt-4 overflow-hidden rounded-lg shadow-lg ring-1 ring-line">
            <QrPoster business={business} link={url} showcase={isShowcase(business)} />
          </div>
          <a href={`/${business.slug}/afis`} target="_blank" rel="noreferrer" className="btn btn-primary mt-4 w-full">
            <Printer className="size-4" /> Afişi yazdır
          </a>
          <p className="mt-2 text-xs text-ink-3">Yazıcınız yoksa açılan sayfada PDF olarak kaydedip bir kırtasiyede bastırabilirsiniz.</p>
        </section>
      </div>

      <ShareLinks url={url} showcase={isShowcase(business)} />
    </div>
  );
}

// Her kanalın bağlantısı ?kaynak= ile etiketlidir: ziyaretlerin nereden geldiği istatistikte görünür.
function ShareLinks({ url, showcase }: { url: string; showcase: boolean }) {
  const action = showcase ? "Menüyü gör" : "Randevu al";
  const siteLink = `${url}?kaynak=site`;
  const button = `<a href="${siteLink}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#14b8a6;color:#fff;font:600 16px/1.2 system-ui,sans-serif;text-decoration:none">${action}</a>`;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="font-semibold">Instagram</h2>
        <CopyField value={`${url}?kaynak=instagram`} />
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Profilinizde <b>Profili düzenle → Bağlantılar → Harici bağlantı ekle</b> deyin ve bağlantıyı yapıştırın.</li>
          <li>Başlığa “{action}” yazın; bağlantı profilinizin üstünde görünür.</li>
          <li>Hikâyelerde <b>Bağlantı</b> çıkartmasıyla da paylaşabilirsiniz.</li>
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Google İşletme Profili</h2>
        <CopyField value={`${url}?kaynak=google`} />
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Google’da işletmenizin adını aratın (hesabınızla girişli olun) ve <b>Profili düzenle</b> deyin.</li>
          <li><b>İletişim</b> bölümünde <b>{showcase ? "Menü bağlantısı" : "Randevu bağlantıları"}</b> alanına bağlantıyı yapıştırıp kaydedin.</li>
          <li>Onaydan sonra Google Haritalar’da profilinizde “{action}” düğmesi çıkar.</li>
        </ol>
      </section>

      <section className="card p-5 md:col-span-2">
        <h2 className="font-semibold">Web sitesi düğmesi</h2>
        <p className="mt-1 text-sm text-ink-3">
          Kodu sitenizin HTML alanına (WordPress, Wix, Ticimax “HTML ekle” bölümü) yapıştırın; ziyaretçi düğmeye basınca SiftahGo sayfanız açılır.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {/* Önizleme: kodun aynısı */}
          <span dangerouslySetInnerHTML={{ __html: button }} />
          <span className="text-xs text-ink-3">Önizleme</span>
        </div>
        <CopyField value={button} multiline />
        <p className="mt-3 text-sm text-ink-3">
          WhatsApp için: <span className="font-mono">{`${url}?kaynak=whatsapp`}</span> bağlantısını durumunuza ve işletme profilinize ekleyin.
        </p>
      </section>
    </div>
  );
}

function CopyField({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-start gap-2">
      {multiline ? (
        <textarea readOnly rows={3} className="input min-w-0 flex-1 font-mono text-xs" value={value} onFocus={(e) => e.target.select()} />
      ) : (
        <input readOnly className="input min-w-0 flex-1 font-mono text-xs" value={value} onFocus={(e) => e.target.select()} />
      )}
      <button
        type="button"
        className="btn btn-secondary shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}
