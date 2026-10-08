import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { Profile } from './types';

type AuthState = { session: Session | null; profile: Profile | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true });

  useEffect(() => {
    async function apply(session: Session | null) {
      if (!session) return setState({ session: null, profile: null, loading: false });
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      setState({ session, profile: data as Profile | null, loading: false });
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase istemcisini bu callback içinde beklemek kilitlenmeye yol açabilir.
      setTimeout(() => apply(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
