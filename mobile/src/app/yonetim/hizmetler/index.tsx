import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { RevealCell } from '@/components/motion';
import { Badge, Button, Card, Empty, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDuration, formatPrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service } from '@/lib/types';

export default function ServicesScreen() {
  const { business } = useAuth();
  return business ? <Services business={business} /> : null;
}

function Services({ business }: { business: Business }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const add = () => router.push({ pathname: '/yonetim/hizmetler/[id]', params: { id: 'yeni' } });

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('services')
        .select('*')
        .eq('business_id', business.id)
        .order('sort_order')
        .order('created_at')
        .then(({ data }) => setServices((data ?? []) as Service[]));
    }, [business.id]),
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerRight: () => <HeaderButton icon="add" label="Hizmet ekle" onPress={add} /> }} />
      <FlatList
        data={services ?? []}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<Text tone="muted">Müşterilerin randevu alabileceği hizmetler, süreleri ve fiyatları.</Text>}
        ListEmptyComponent={
          services === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={72} />
              <Skeleton height={72} />
            </View>
          ) : (
            <Empty icon="cut-outline" title="Henüz hizmet yok" text="İlk hizmetinizi ekleyin; müşterileriniz hemen randevu alabilsin.">
              <Button title="Hizmet ekle" icon="add" onPress={add} />
            </Empty>
          )
        }
        ListFooterComponent={services?.length ? <Button title="Hizmet ekle" icon="add" variant="secondary" onPress={add} style={{ marginTop: 4 }} /> : null}
        CellRendererComponent={RevealCell}
        renderItem={({ item: x }) => (
          <Card
            onPress={() => router.push({ pathname: '/yonetim/hizmetler/[id]', params: { id: x.id } })}
            accessibilityLabel={x.name}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, !x.is_active && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.rowCenter, { gap: 6 }]}>
                <Text variant="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
                  {x.name}
                </Text>
                {!x.is_active && <Badge label="Gizli" icon="eye-off-outline" />}
              </View>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {formatDuration(x.duration_minutes)}
                {x.description ? ` · ${x.description}` : ''}
              </Text>
            </View>
            <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
              {formatPrice(x.price)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
          </Card>
        )}
      />
    </View>
  );
}
