import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Glow } from '@/components/brand';
import { PlanGate } from '@/components/plan-gate';
import { Sheet } from '@/components/sheet';
import { Avatar, Banner, Button, Card, Empty, Field, IconButton, ScreenHeader, Skeleton, Stat, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, formatDate, formatPrice, formatTime, whatsappLink } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business } from '@/lib/types';

type Customer = {
  phone: string;
  name: string;
  total: number;
  completed: number;
  no_show: number;
  cancelled: number;
  spent: number;
  last_visit: string | null;
  next_appointment: string | null;
};

export default function CustomersTab() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <View style={styles.screen}>
      <Glow />
      <PlanGate business={business} feature="customers" title="Müşteri defteri" header={<ScreenHeader title="Müşteriler" />}>
        <Customers business={business} />
      </PlanGate>
    </View>
  );
}

function Customers({ business }: { business: Business }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('get_customers', { p_business_id: business.id }).then(({ data, error }) => {
        setError(error ? errorMessage(error) : '');
        setCustomers((data ?? []) as Customer[]);
      });
    }, [business.id]),
  );

  const q = query.trim().toLocaleLowerCase('tr-TR');
  const digits = query.replace(/\D/g, '');
  const list = (customers ?? []).filter(
    (c) => !q || c.name.toLocaleLowerCase('tr-TR').includes(q) || (digits && c.phone.replace(/\D/g, '').includes(digits)),
  );
  const greeting = (c: Customer) => `Merhaba ${c.name.split(' ')[0]}, ${business.name} olarak sizi tekrar görmek isteriz!`;

  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(c) => c.phone}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <ScreenHeader title="Müşteriler" subtitle={customers ? `${customers.length} kişi · telefon numarasına göre` : undefined} />
            <Field icon="search-outline" placeholder="İsim veya telefon ara" value={query} onChangeText={setQuery} autoCorrect={false} />
            {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          customers === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={76} />
              <Skeleton height={76} />
              <Skeleton height={76} />
            </View>
          ) : (
            <Empty
              icon="people-outline"
              title={customers.length === 0 ? 'Henüz müşteriniz yok' : 'Sonuç yok'}
              text={customers.length === 0 ? 'İlk randevular geldikçe müşterileriniz burada listelenir.' : 'Aramanıza uygun müşteri bulunamadı.'}
            />
          )
        }
        renderItem={({ item: c }) => (
          // Arama/WhatsApp düğmeleri ekran okuyucuda ayrı erişilsin diye kart değil satır dokunulabilir.
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
            <Pressable
              onPress={() => setSelected(c)}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ayrıntılar`}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={c.name} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {c.completed} ziyaret · {formatPrice(c.spent)}
                  {c.no_show > 0 ? <Text variant="caption" tone="danger">{` · ${c.no_show} kez gelmedi`}</Text> : null}
                </Text>
                <Text variant="caption" tone={c.next_appointment ? 'brand' : 'muted'} numberOfLines={1}>
                  {c.next_appointment
                    ? `Sıradaki: ${formatDate(c.next_appointment, false)} ${formatTime(c.next_appointment)}`
                    : c.last_visit
                      ? `Son ziyaret: ${formatDate(c.last_visit, false)}`
                      : 'Henüz tamamlanan ziyaret yok'}
                </Text>
              </View>
            </Pressable>
            <IconButton icon="call-outline" label={`${c.name} ara`} size={38} onPress={() => Linking.openURL(`tel:${c.phone}`)} />
            <IconButton icon="logo-whatsapp" label={`${c.name} WhatsApp`} size={38} color={colors.success} onPress={() => Linking.openURL(whatsappLink(c.phone, greeting(c)))} />
          </Card>
        )}
      />

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name} subtitle={selected?.phone}>
        {selected && (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label="Ziyaret" value={String(selected.completed)} icon="checkmark-done" />
              <Stat label="Harcama" value={formatPrice(selected.spent)} icon="cash-outline" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label="Gelmedi" value={String(selected.no_show)} icon="ban-outline" />
              <Stat label="İptal" value={String(selected.cancelled)} icon="close-circle-outline" />
            </View>
            {selected.next_appointment ? (
              <View style={s.line}>
                <Ionicons name="calendar-outline" size={18} color={colors.brand300} />
                <Text tone="secondary">
                  Sıradaki randevu: {formatDate(selected.next_appointment)} {formatTime(selected.next_appointment)}
                </Text>
              </View>
            ) : null}
            <Button
              title="Randevu ekle"
              icon="add"
              onPress={() => {
                const c = selected;
                setSelected(null);
                router.push({ pathname: '/randevu-ekle', params: { name: c.name, phone: c.phone } });
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Ara" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${selected.phone}`)} />
              <Button
                title="WhatsApp"
                icon="logo-whatsapp"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => Linking.openURL(whatsappLink(selected.phone, greeting(selected)))}
              />
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
