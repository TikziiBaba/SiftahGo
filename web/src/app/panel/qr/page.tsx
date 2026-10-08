"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Printer } from "lucide-react";
import { useBusiness } from "@/components/panel-context";
import { SITE_NAME } from "@/lib/constants";

export default function QrPage() {
  const { business } = useBusiness();
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const link = `${process.env.NEXT_PUBLIC_APP_URL || location.origin}/${business.slug}`;
    QRCode.toDataURL(link, { width: 720, margin: 1, color: { dark: "#134e4a" } }).then((data) => {
      setUrl(link);
      setQr(data);
    });
  }, [business.slug]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold print:hidden">QR kod ve bağlantı</h1>
      <p className="text-sm text-ink-3 print:hidden">
        QR kodu yazdırıp dükkânınıza asın; bağlantıyı Instagram, WhatsApp ve Google profilinize ekleyin.
      </p>

      <div className="card mt-6 flex flex-col items-center p-8 text-center print:border-0">
        <p className="text-2xl font-bold">{business.name}</p>
        <p className="mt-1 text-ink-3">Randevu almak için kodu okutun</p>
        {qr ? <img src={qr} alt="QR kod" className="mt-6 size-64" /> : <div className="mt-6 size-64 animate-pulse rounded-xl bg-surface-2" />}
        <p className="mt-4 font-mono text-sm">{url}</p>
        <p className="mt-6 text-xs text-ink-3">{SITE_NAME}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
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
        <a href={qr} download={`${business.slug}-qr.png`} className="btn btn-secondary">
          <Download className="size-4" /> PNG indir
        </a>
        <button className="btn btn-primary" onClick={() => print()}>
          <Printer className="size-4" /> Yazdır
        </button>
      </div>
    </div>
  );
}
