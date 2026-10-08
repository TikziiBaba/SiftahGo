import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';

import { Button, Card, Empty, Loading, StatusBadge, styles } from '@/components/ui';
import { colors, STATUS, WEB_URL } from '@/lib/constants';
import {
  addDays,
  dayBounds,
  errorMessage,
  formatDate,
  formatPrice,
  formatTime,
  reminderText,
  todayStr,
  whatsappLink,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Appointment, AppointmentStatus, Business } from '@/lib/types';

type Row = Appointment & { staff: { name: string } | null };

/** İşletme sahibi için günlük randevu listesi (detaylı yönetim web panelinde). */
export function BusinessAgenda({ userId }: { userId: string }) {
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);
  const [subscribed, setSubscribed] = useState(true);
  const [day, setDay] = useState(todayStr);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setSubscribed(!!data?.subscription_ends_at && new Date(data.subscription_ends_at) > new Date());
        setBusiness(data);
      });
  }, [userId]);

  const load = useCallback(async () => {
    if (!business) return;
    const { from, to } = dayBounds(day);
    const { data } = await supabase
      .from('appointments')
      .select('*, staff(name)')
      .eq('business_id', business.id)
      .gte('starts_at', from)
      .lt('starts_at', to)
      .order('starts_at');
    setRows((data ?? []) as Row[]);
    setRefreshing(false);
  }, [business, day]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seçili günün randevularını yükle
    load();
  }, [load]);

  useEffect(() => {
    if (!business) return;
    const channel = supabase
      .channel(`mobile-appointments-${business.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${business.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [business, load]);

  function changeStatus(row: Row) {
    const options = (Object.keys(STATUS) as AppointmentStatus[]).filter((s) => s !== row.status);
    Alert.alert(row.customer_name, `${formatTime(row.starts_at)} · ${row.service_name}`, [
      ...options.map((status) => ({
        text: STATUS[status].label,
        style: status === 'cancelled' ? ('destructive' as const) : ('default' as const),
        onPress: async () => {
          const { error } = await supabase.from('appointments').update({ status }).eq('id', row.id);
          if (error) Alert.alert('Hata', errorMessage(error));
          load();
        },
      })),
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  if (business === undefined) return <Loading />;
  if (business === null) {
    return (
      <View style={styles.content}>
        <Empty text="Henüz işletmenizi oluşturmadınız. İşletme kurulumunu web panelinden yapabilirsiniz." />
      </View>
    );
  }

  if (!subscribed) {
    return (
      <View style={styles.content}>
        <Empty text="Aktif paketiniz yok. Paket seçene kadar sayfanız yayında görünmez ve randevu alınamaz.">
          <Button title="Paketleri gör" onPress={() => Linking.openURL(`${WEB_URL}/panel/abonelik`)} style={{ alignSelf: 'stretch' }} />
        </Empty>
      </View>
    );
  }

  const active = (rows ?? []).filter((r) => r.status !== 'cancelled');
  const revenue = active.filter((r) => r.status !== 'no_show').reduce((sum, r) => sum + Number(r.price), 0);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows ?? []}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => setDay(addDays(day, -1))} hitSlop={12} style={{ padding: 6 }}>
              <Ionicons name="chevron-back" size={24} color={colors.brand} />
            </Pressable>
            <Pressable onPress={() => setDay(todayStr())}>
              <Text style={[styles.h2, { textAlign: 'center' }]}>{formatDate(day)}</Text>
              {day !== todayStr() && <Text style={{ color: colors.brand, textAlign: 'center' }}>Bugüne dön</Text>}
            </Pressable>
            <Pressable onPress={() => setDay(addDays(day, 1))} hitSlop={12} style={{ padding: 6 }}>
              <Ionicons name="chevron-forward" size={24} color={colors.brand} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <Text style={styles.muted}>Randevu</Text>
              <Text style={styles.h1}>{active.length}</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={styles.muted}>Beklenen ciro</Text>
              <Text style={styles.h1}>{formatPrice(revenue)}</Text>
            </Card>
          </View>
        </View>
      }
      ListEmptyComponent={rows === null ? <Loading /> : <Empty text="Bu gün için randevu yok." />}
      renderItem={({ item }) => (
        <Pressable onPress={() => changeStatus(item)}>
          <Card style={{ flexDirection: 'row', gap: 12, opacity: item.status === 'cancelled' ? 0.55 : 1 }}>
            <View style={{ width: 56, alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{formatTime(item.starts_at)}</Text>
              <Text style={styles.muted}>{formatTime(item.ends_at)}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{item.customer_name}</Text>
              <Text style={styles.muted}>
                {item.service_name}{item.staff ? ` · ${item.staff.name}` : ''} · {formatPrice(item.price)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Pressable onPress={() => Linking.openURL(`tel:${item.customer_phone}`)} hitSlop={8}>
                  <Text style={{ color: colors.brand }}>{item.customer_phone}</Text>
                </Pressable>
                {['pending', 'confirmed'].includes(item.status) && (
                  <Pressable
                    onPress={() => Linking.openURL(whatsappLink(item.customer_phone, reminderText(item, business.name)))}
                    hitSlop={8}>
                    <Text style={{ color: '#047857', fontWeight: '500' }}>WhatsApp ile hatırlat</Text>
                  </Pressable>
                )}
              </View>
              {item.note ? <Text style={[styles.muted, { fontStyle: 'italic' }]}>“{item.note}”</Text> : null}
              <StatusBadge status={item.status} />
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}
