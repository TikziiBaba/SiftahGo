"use client";

import { useEffect } from "react";
import { addRecent, type RecentBusiness } from "@/lib/recent";

/** İşletme sayfası açılınca "Son baktıkların" listesine ekler (işlevsel çerez onayı varsa). */
export function TrackRecent(props: RecentBusiness) {
  const { slug, name, category, logo_url, city } = props;
  useEffect(() => {
    addRecent({ slug, name, category, logo_url, city });
  }, [slug, name, category, logo_url, city]);
  return null;
}
