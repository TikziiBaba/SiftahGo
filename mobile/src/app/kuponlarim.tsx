import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Banner, Button, Card, Empty, Skeleton, styles, Text } from '@/components/ui';
import { formatCouponWhen, formatDiscount } from '@/lib/coupons';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { MyCoupon } from '@/lib/types';

const STATE: Record<MyCoupon['state'], string> = {
  active: 'Kullanılabilir',
  attached: 'Randevuya bağlı',
  used: 'Kullanıldı',
  expired: 'Süresi doldu',
};

/** Hesap altında müşterinin aldığı kuponlar ve kodları (web: components/my-coupons.tsx). */
export default function MyCouponsScreen() {
  const [list, setList] = useState<MyCoupon[] | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('my_coupons').then(({ data, error }) => {
        setError(error ? errorMessage(error) : '');
        setList((data ?? []) as MyCoupon[]);
      });
    }, []),
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {list === null ? (
          <>
            <Skeleton height={96} />
            <Skeleton height={96} />
          </>
        ) : error ? (
          <Banner tone="danger" icon="alert-circle-outline" text={error} />
        ) : list.length === 0 ? (
          <Empty icon="ticket-outline" title="Henüz kuponun yok" text="İşletme sayfalarındaki “Kuponu al” düğmesiyle kupon alabilirsin." />
        ) : (
          list.map((c) => (
            <Card key={c.claim_id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 14 }, (c.state === 'used' || c.state === 'expired') && { opacity: 0.6 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{c.title}</Text>
                <Button
                  title={c.business_name}
                  variant="ghost"
                  size="sm"
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                  onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: c.business_slug } })}
                />
                <Text variant="label" tone="brand">
                  {formatDiscount(c)}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatCouponWhen(c)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text variant="title" style={{ letterSpacing: 3, fontVariant: ['tabular-nums'], color: colors.brand300 }}>
                  {c.code}
                </Text>
                <Text variant="caption" tone="muted">
                  {STATE[c.state]}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
