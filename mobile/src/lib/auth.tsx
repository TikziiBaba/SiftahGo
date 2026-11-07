import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { signOutGoogle } from './google';
import { unregisterPushToken } from './notifications';
import { supabase } from './supabase';
import type { Business, Profile } from './types';

export type Branch = { id: string; name: string; approval_status: string };
// business: seçili şube (my_business_id); branches: hesabın tüm işletmeleri.
type AuthState = { session: Session | null; profile: Profile | null; business: Business | null; branches: Branch[]; loading: boolean };
type AuthContextValue = AuthState & { refresh: () => Promise<void>; switchBusiness: (id: string) => Promise<string | null> };

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  business: null,
  branches: [],
  loading: true,
  refresh: async () => {},
  switchBusiness: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, business: null, branches: [], loading: true });

  // Profil ve işletme birlikte yüklenir; giriş sonrası ekranlar yarım veriyle açılmaz.
  const apply = useCallback(async (session: Session | null) => {
    if (!session) return setState({ session: null, profile: null, business: null, branches: [], loading: false });
    const [{ data: profile }, { data: activeId }, { data: branches }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.rpc('my_business_id'),
      supabase.from('businesses').select('id, name, approval_status').eq('owner_id', session.user.id).order('created_at'),
    ]);
    const { data: business } = activeId ? await supabase.from('businesses').select('*').eq('id', activeId).maybeSingle() : { data: null };
    setState({
      session,
      profile: profile as Profile | null,
      business: business as Business | null,
      branches: (branches ?? []) as Branch[],
      loading: false,
    });
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

  // Şube değiştirir; hata varsa iletisini döner.
  const switchBusiness = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc('set_active_business', { p_id: id });
      if (error) return error.message;
      await refresh();
      return null;
    },
    [refresh],
  );

  return <AuthContext.Provider value={{ ...state, refresh, switchBusiness }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Çıkış. Önce bu telefon hesabın bildirim listesinden çıkarılır (oturum gerektirir). */
export async function signOut() {
  await unregisterPushToken().catch(() => {});
  await signOutGoogle();
  await supabase.auth.signOut();
}
