import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { unregisterPushToken } from './notifications';
import { supabase } from './supabase';
import type { Business, Profile } from './types';

type AuthState = { session: Session | null; profile: Profile | null; business: Business | null; loading: boolean };
type AuthContextValue = AuthState & { refresh: () => Promise<void> };

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  business: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, business: null, loading: true });

  // Profil ve işletme birlikte yüklenir; giriş sonrası ekranlar yarım veriyle açılmaz.
  const apply = useCallback(async (session: Session | null) => {
    if (!session) return setState({ session: null, profile: null, business: null, loading: false });
    const [{ data: profile }, { data: business }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.from('businesses').select('*').eq('owner_id', session.user.id).maybeSingle(),
    ]);
    setState({ session, profile: profile as Profile | null, business: business as Business | null, loading: false });
  }, []);

  useEffect(() => {
    // İlk olay (INITIAL_SESSION) kayıtlı oturumla gelir.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase istemcisini bu callback içinde beklemek kilitlenmeye yol açabilir.
      setTimeout(() => apply(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [apply]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await apply(data.session);
  }, [apply]);

  return <AuthContext.Provider value={{ ...state, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Çıkış. Önce bu telefon hesabın bildirim listesinden çıkarılır (oturum gerektirir). */
export async function signOut() {
  await unregisterPushToken().catch(() => {});
  await supabase.auth.signOut();
}
