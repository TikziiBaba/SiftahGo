import { useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { Plan } from './types';

/** İşletmenin paketi. undefined = yükleniyor, null = paket yok. */
export function usePlan(planId: string | null) {
  const [result, setResult] = useState<{ id: string; plan: Plan | null } | null>(null);

  useEffect(() => {
    if (!planId) return;
    let active = true;
    supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setResult({ id: planId, plan: data as Plan | null });
      });
    return () => {
      active = false;
    };
  }, [planId]);

  if (!planId) return null;
  return result?.id === planId ? result.plan : undefined;
}

export function daysLeft(endsAt: string | null) {
  return endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 864e5) : 0;
}
