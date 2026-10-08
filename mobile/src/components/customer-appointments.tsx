import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';

import { ReviewSheet } from '@/components/review-sheet';

import { Button, Card, Empty, Loading, StatusBadge, styles } from '@/components/ui';
import { colors } from '@/lib/constants';
import { errorMessage, formatDate, formatPrice, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';

type Row = Appointment & { businesses: { name: string; slug: string } | null };

export function CustomerAppointments({ userId }: { userId: string }) {
  const [lists, setLists] = useState<{ upcoming: Row[]; past: Row[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: reviews }] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, businesses(name, slug)')
        .eq('customer_id', userId)
        .order('starts_at', { ascending: false })
        .limit(100),
      supabase.from('reviews').select('appointment_id').eq('customer_id', userId),
    ]);
    setReviewed(new Set((reviews ?? []).map((r: { appointment_id: string }) => r.appointment_id)));
    const rows = (data ?? []) as Row[];
    const now = new Date().toISOString();
    const isUpcoming = (r: Row) => r.starts_at >= now && ['pending', 'confirmed'].includes(r.status);
    setLists({ upcoming: rows.filter(isUpcoming).reverse(), past: rows.filter((r) => !isUpcoming(r)) });
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- randevuları ilk açılışta yükle
    load();
  }, [load]);

  function cancel(row: Row) {
    Alert.alert('Randevuyu iptal et', `${row.businesses?.name ?? ''} · ${formatDate(row.starts_at)} ${formatTime(row.starts_at)}`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('cancel_appointment', { p_id: row.id });
          if (error) Alert.alert('Hata', errorMessage(error));
          load();
        },
      },
    ]);
  }

  if (!lists) return <Loading />;

  const sections = [
    { title: 'Yaklaşan', data: lists.upcoming },
    ...(lists.past.length ? [{ title: 'Geçmiş', data: lists.past }] : []),
  ];

  return (
    <>
      <SectionList
        style={styles.screen}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderSectionHeader={({ section }) => <Text style={[styles.h2, { marginTop: 8 }]}>{section.title}</Text>}
        renderSectionFooter={({ section }) =>
          section.title === 'Yaklaşan' && section.data.length === 0 ? (
            <Empty text="Yaklaşan randevunuz yok.">
              <Button title="Randevu Al" onPress={() => router.navigate('/')} style={{ alignSelf: 'stretch' }} />
            </Empty>
          ) : null
        }
        renderItem={({ item, section }) => (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => item.businesses && router.push({ pathname: '/isletme/[slug]', params: { slug: item.businesses.slug } })}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{item.businesses?.name ?? 'İşletme'}</Text>
              </Pressable>
              <StatusBadge status={item.status} />
            </View>
            <Text style={{ color: colors.text }}>
              {formatDate(item.starts_at)} · <Text style={{ fontWeight: '700' }}>{formatTime(item.starts_at)}</Text>
            </Text>
            <Text style={styles.muted}>{item.service_name} · {formatPrice(item.price)}</Text>
            {section.title === 'Yaklaşan' ? (
              <Button title="İptal et" variant="danger" onPress={() => cancel(item)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, paddingVertical: 6 }} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {item.businesses && (
                  <Button
                    title="Tekrar al"
                    variant="ghost"
                    onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: item.businesses!.slug } })}
                    style={{ paddingHorizontal: 0, paddingVertical: 6 }}
                  />
                )}
                {item.status === 'completed' && !reviewed.has(item.id) && (
                  <Button title="Değerlendir" variant="ghost" onPress={() => setReviewing(item)} style={{ paddingHorizontal: 0, paddingVertical: 6 }} />
                )}
              </View>
            )}
          </Card>
        )}
      />
      <ReviewSheet
        appointment={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          load();
        }}
      />
    </>
  );
}
