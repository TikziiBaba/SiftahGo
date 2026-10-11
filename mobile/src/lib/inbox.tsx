import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth';
import { supabase } from './supabase';

export type InboxItem = {
  id: string;
  kind: 'booked' | 'confirmed' | 'cancelled' | 'rescheduled' | 'reminder' | 'review' | 'reviewed';
  recipient: 'customer' | 'business';
  appointment_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  appointments: { starts_at: string } | null;
};

type InboxValue = { items: InboxItem[] | null; unread: number; markAllRead: () => Promise<void> };

const InboxContext = createContext<InboxValue>({ items: null, unread: 0, markAllRead: async () => {} });

/** Kullanıcının son 50 bildirimi. Yenileri Realtime ile anında gelir. */
export function InboxProvider({ children }: { children: React.ReactNode }) {
  const userId = useAuth().session?.user.id;
  const [state, setState] = useState<{ userId: string; items: InboxItem[] } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('inbox')
      .select('id, kind, recipient, appointment_id, title, body, read_at, created_at, appointments(starts_at)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setState({ userId, items: data as unknown as InboxItem[] });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // İlk yükleme abonelik kurulunca yapılır; arada gelen bildirim kaçmaz.
    const channel = supabase
      .channel(`inbox-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    // Arka plandayken Realtime bağlantısı kopabilir; uygulamaya dönünce tazele.
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => {
      supabase.removeChannel(channel);
      appState.remove();
    };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setState((s) => s && { ...s, items: s.items.map((i) => (i.read_at ? i : { ...i, read_at: now })) });
    await supabase.rpc('mark_inbox_read');
  }, []);

  // Hesap değişince eski hesabın bildirimleri görünmez.
  const items = state && state.userId === userId ? state.items : null;
  const unread = items ? items.filter((i) => !i.read_at).length : 0;

  return <InboxContext.Provider value={{ items, unread, markAllRead }}>{children}</InboxContext.Provider>;
}

export const useInbox = () => useContext(InboxContext);
