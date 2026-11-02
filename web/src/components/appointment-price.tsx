import { formatMoney } from "@/lib/coupons";

/** Randevu tutarı. Kuponlu randevuda (list_price dolu) üstü çizili liste fiyatı ve "Kupon" işareti de görünür; kuruşlar yuvarlanmaz. */
export function AppointmentPrice({ price, listPrice }: { price: number; listPrice: number | null }) {
  return (
    <>
      {formatMoney(price)}
      {listPrice !== null && (
        <>
          {" "}
          <s className="text-ink-3">{formatMoney(listPrice)}</s> <span className="chip bg-brand-400/10 px-2 text-2xs text-accent">Kupon</span>
        </>
      )}
    </>
  );
}
