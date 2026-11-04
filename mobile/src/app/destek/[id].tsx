import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardScreen } from '@/components/keyboard-screen';
import { Badge, Button, Field, LoadError, Skeleton, styles, Text } from '@/components/ui';
import { SUPPORT_CATEGORIES, SUPPORT_STATUS } from '@/lib/constants';
import { errorMessage, formatDateTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { SupportMessage, SupportTicket } from '@/lib/types';

/** Bir destek talebinin konuşması ve yanıt alanı (web: SupportCenter içindeki TicketView). */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setFailed(false);
    const [t, m] = await Promise.all([
      supabase.from('support_tickets').select('*').eq('id', id).maybeSingle(),
      supabase.from('support_messages').select('*').eq('ticket_id', id).order('created_at'),
    ]);
    if (t.error || m.error) return setFailed(true);
    setTicket(t.data as SupportTicket | null);
    setMessages((m.data ?? []) as SupportMessage[]);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- konuşma ilk açılışta yüklenir
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('reply_support_ticket', { p_id: id, p_body: body.trim() });
    setBusy(false);
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    haptic.success();
    setBody('');
    await load();
  }

  const status = ticket ? SUPPORT_STATUS[ticket.status] : null;

  return (
    <KeyboardScreen>
      <Stack.Screen options={{ title: 'Destek talebi' }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {failed ? (
          <LoadError onRetry={load} />
        ) : !ticket || !messages ? (
          messages && !ticket ? (
            <Text tone="muted">Bu talep bulunamadı.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              <Skeleton height={48} />
              <Skeleton height={96} />
            </View>
          )
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Text variant="heading">{ticket.subject}</Text>
              <View style={[styles.rowCenter, { gap: 8 }]}>
                {status ? <Badge label={status.label} fg={status.fg} bg={status.bg} /> : null}
                <Text variant="caption" tone="muted">
                  {SUPPORT_CATEGORIES[ticket.category]}
                </Text>
              </View>
            </View>
            {messages.map((m) => (
              <View key={m.id} style={[s.bubble, m.from_admin ? s.theirs : s.mine]}>
                <Text variant="caption" tone="muted">
                  {m.from_admin ? 'SiftahGo Destek' : 'Siz'} · {formatDateTime(m.created_at)}
                </Text>
                <Text selectable>{m.body}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
      {ticket ? (
        <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {ticket.status === 'closed' ? (
            <Text variant="caption" tone="muted">
              Bu talep kapatıldı. Sorun devam ediyorsa yazın; talep yeniden açılır.
            </Text>
          ) : null}
          <Field placeholder="Yanıtınız" value={body} onChangeText={setBody} multiline maxLength={4000} autoCapitalize="sentences" style={{ minHeight: 48 }} />
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Gönder" icon="send" onPress={send} loading={busy} disabled={body.trim().length < 2} />
        </View>
      ) : null}
    </KeyboardScreen>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '88%', gap: 4, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brandSoft, borderColor: colors.brandLine },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white04, borderColor: colors.line },
  composer: { gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg },
});
