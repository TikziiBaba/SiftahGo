import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { Sheet } from '@/components/sheet';
import { Badge, Button, Card, Chip, Empty, Field, LoadError, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isShowcase, SUPPORT_CATEGORIES, SUPPORT_STATUS } from '@/lib/constants';
import { errorMessage, formatDateTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import type { SupportCategory, SupportTicket } from '@/lib/types';

/** Kullanıcının destek talepleri ve yeni talep (web: components/support-center.tsx). */
export default function SupportScreen() {
  const { session, business } = useAuth();
  const userId = session?.user.id;
  // Vitrin esnafında randevu yok; o konu listede çıkmaz.
  const showcase = !!business && business.approval_status === 'approved' && isShowcase(business);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    setFailed(false);
    supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => (error ? setFailed(true) : setTickets((data ?? []) as SupportTicket[])));
  }, [userId]);
  useFocusEffect(load);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerRight: () => <HeaderButton icon="add" label="Yeni talep" onPress={() => setCreating(true)} /> }} />
      <FlatList
        data={tickets ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text tone="muted">
            {showcase ? 'SiftahGo ekibine yazın.' : 'SiftahGo ekibine yazın. Saat, fiyat gibi randevu konularında en hızlı yanıtı işletmenin kendisi verir.'} Yanıtımız
            e-posta adresinize de gelir.
          </Text>
        }
        ListEmptyComponent={
          failed ? (
            <LoadError onRetry={load} />
          ) : tickets === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={72} />
              <Skeleton height={72} />
            </View>
          ) : (
            <Empty icon="help-buoy-outline" title="Henüz destek talebiniz yok" text="Bir sorun yaşarsanız talep açın.">
              <Button title="Yeni talep" icon="add" onPress={() => setCreating(true)} />
            </Empty>
          )
        }
        ListFooterComponent={tickets?.length ? <Button title="Yeni talep" icon="add" variant="secondary" onPress={() => setCreating(true)} style={{ marginTop: 4 }} /> : null}
        renderItem={({ item: t }) => (
          <Card
            onPress={() => router.push({ pathname: '/destek/[id]', params: { id: t.id } })}
            accessibilityLabel={`${t.subject}, ${SUPPORT_STATUS[t.status].label}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {t.subject}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {SUPPORT_CATEGORIES[t.category]} · {formatDateTime(t.last_message_at)}
              </Text>
            </View>
            <Badge label={SUPPORT_STATUS[t.status].label} fg={SUPPORT_STATUS[t.status].fg} bg={SUPPORT_STATUS[t.status].bg} />
          </Card>
        )}
      />
      <NewTicket
        visible={creating}
        showcase={showcase}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          load();
          router.push({ pathname: '/destek/[id]', params: { id } });
        }}
      />
    </View>
  );
}

function NewTicket({ visible, showcase, onClose, onCreated }: { visible: boolean; showcase: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [category, setCategory] = useState<SupportCategory>('teknik');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = subject.trim().length >= 3 && body.trim().length >= 2;

  async function submit() {
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('open_support_ticket', { p_category: category, p_subject: subject.trim(), p_body: body.trim() });
    setBusy(false);
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    haptic.success();
    setSubject('');
    setBody('');
    onCreated(data as string);
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Yeni destek talebi"
      footer={<Button title="Gönder" icon="send" onPress={submit} loading={busy} disabled={!ready} />}>
      <Text variant="label" tone="secondary">
        Konu
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.entries(SUPPORT_CATEGORIES) as [SupportCategory, string][])
          .filter(([id]) => !(showcase && id === 'randevu'))
          .map(([id, label]) => (
            <Chip key={id} label={label} selected={category === id} onPress={() => setCategory(id)} />
          ))}
      </View>
      <Field label="Kısaca sorun" placeholder="Örn. Ödemem görünmüyor" value={subject} onChangeText={setSubject} maxLength={120} autoCapitalize="sentences" />
      <Field
        label="Mesajınız"
        placeholder={showcase ? 'Ne oldu, ne zaman oldu? Varsa işletme adını ve tarihi yazın.' : 'Ne oldu, ne zaman oldu? Varsa işletme adını ve randevu tarihini yazın.'}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={4000}
        autoCapitalize="sentences"
      />
      {error ? (
        <Text variant="label" tone="danger">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
