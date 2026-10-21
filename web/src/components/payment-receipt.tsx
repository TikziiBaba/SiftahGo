import { CheckCircle2, Loader2 } from "lucide-react";
import { formatDate, formatPrice, formatTime } from "@/lib/format";
import type { Payment } from "@/lib/types";

/**
 * PayTR dönüşündeki ödeme sonucu: ödeme onaylanana kadar "yazıcı" bekler, onaylanınca fiş yazıcının
 * ağzından aşağı çıkar. payment yoksa ya da beklemedeyse yalnızca bekleme durumu görünür.
 */
export function PaymentReceipt({ payment, planName }: { payment?: Payment; planName?: string }) {
  const paid = payment?.status === "paid";
  const at = payment?.paid_at ?? payment?.created_at;
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative z-10 rounded-[1.75rem] bg-surface-3 p-1.5 shadow-[0_24px_40px_-24px_rgb(0_0_0/0.9)] ring-1 ring-line-strong">
        <div className="flex items-center gap-3 rounded-[1.4rem] bg-surface-2 px-4 py-3.5 text-sm">
          {paid ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : <Loader2 className="size-5 shrink-0 animate-spin text-ink-3" />}
          <p className="min-w-0" aria-live="polite">
            <span className="block font-medium">{paid ? "Teşekkürler, ödemeniz alındı" : "Ödemeniz onaylanıyor"}</span>
            <span className="block text-ink-3">
              {paid ? "Aboneliğiniz aktif. Sayfanız yayında ve randevu alabilirsiniz." : "Bu birkaç saniye sürebilir…"}
            </span>
          </p>
        </div>
        {/* Fişin çıktığı ağız */}
        <div className="mx-4 mb-1 mt-2 h-1.5 rounded-full bg-black/70 shadow-[inset_0_1px_2px_rgb(0_0_0/0.9)]" />
      </div>
      {paid && at && (
        <div className="-mt-2.5 overflow-hidden px-7">
          <div className="receipt-print receipt-paper bg-white px-5 pb-7 pt-6 font-mono text-xs text-neutral-800">
            <p className="text-center text-sm font-bold tracking-[0.3em]">SIFTAHGO</p>
            <p className="mt-1 text-center text-neutral-500">
              {formatDate(at, { weekday: undefined, year: "numeric" })} · {formatTime(at)}
            </p>
            <div className="my-3 border-t border-dashed border-neutral-300" />
            <Line label="Paket">{planName ?? payment.plan_id}</Line>
            <Line label="Dönem">{payment.months === 12 ? "Yıllık · 365 gün" : "Aylık · 30 gün"}</Line>
            <Line label="Sipariş">{payment.merchant_oid}</Line>
            <div className="my-3 border-t border-dashed border-neutral-300" />
            <div className="flex items-baseline justify-between text-sm font-bold">
              <span>TOPLAM</span>
              <span className="tabular-nums">{formatPrice(payment.amount)}</span>
            </div>
            <p className="mt-1 text-right text-neutral-500">ÖDENDİ · PayTR</p>
            <div aria-hidden className="receipt-barcode mt-5 h-9" />
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
