"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayStr } from "@/lib/format";
import type { MyCoupon, PublicCoupon } from "@/lib/types";

const COLUMNS = "id, title, discount_type, discount_value, starts_on, ends_on, weekdays, start_time, end_time, service_ids, total_limit, claimed_count";

/**
 * İşletmenin açık kuponları ve girişli müşterinin bu işletmeden aldıkları. Dükkân sayfası önbellekte olduğu için
 * kuponlar sayfaya gömülmez, tarayıcıda her açılışta okunur. loggedIn null: oturum henüz bilinmiyor.
 */
export function useShopCoupons(businessId: string, enabled = true) {
  const [state, setState] = useState<{ coupons: PublicCoupon[]; claims: MyCoupon[]; loggedIn: boolean | null }>({
    coupons: [],
    claims: [],
    loggedIn: null,
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    // Sahibin kendi sayfasında RLS durdurulmuş kuponları da verir; yalnızca açık olanlar gösterilir.
    const [{ data: list }, mine] = await Promise.all([
      supabase
        .from("coupons")
        .select(COLUMNS)
        .eq("business_id", businessId)
        .eq("is_active", true)
        .gte("ends_on", todayStr())
        .order("ends_on"),
      session ? supabase.rpc("my_coupons") : Promise.resolve({ data: [] }),
    ]);
    setState({
      coupons: (list ?? []) as PublicCoupon[],
      claims: ((mine.data ?? []) as MyCoupon[]).filter((c) => c.business_id === businessId),
      loggedIn: !!session,
    });
  }, [businessId, enabled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kuponlar ilk açılışta yüklenir
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
