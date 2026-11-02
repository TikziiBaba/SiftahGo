import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ReviewSheet } from '@/components/review-sheet';
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
  unavailable: 'Şu an kullanılamıyor',
};

/** Hesap altında müşterinin aldığı kuponlar ve kodları (web: components/my-coupons.tsx). */
export default function MyCouponsScreen() {
  const [list, setList] = useState<MyCoupon[] | null>(null);
  const [error, setError] = useState('');
  // Kasada kullanılan vitrin kuponları ve henüz değerlendirilmemiş olanlar (Değerlendir düğmesi için).
  const [showcaseIds, setShowcaseIds] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<MyCoupon | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_coupons');
    setError(error ? errorMessage(error) : '');
    const rows = (data ?? []) as MyCoupon[];
    // Kupon yorumu yalnızca vitrin işletmelerinde yazılır. my_coupons işletme türünü vermez; ayrıca okunur.
    const used = rows.filter((c) => c.state === 'used' && c.redeemed_at);
    if (used.length) {
      const [biz, rev] = await Promise.all([
        supabase.from('businesses').select('id').eq('business_type', 'showcase').in('id', [...new Set(used.map((c) => c.business_id))]),
        supabase.from('reviews').select('coupon_claim_id').in('coupon_claim_id', used.map((c) => c.claim_id)),
      ]);
      setShowcaseIds(new Set((biz.data ?? []).map((b) => b.id as string)));
      setReviewed(new Set((rev.data ?? []).map((r) => r.coupon_claim_id as string)));
    }
    setList(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canReview = (c: MyCoupon) => c.state === 'used' && !!c.redeemed_at && showcaseIds.has(c.business_id) && !reviewed.has(c.claim_id);

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
            <Card
              key={c.claim_id}
              style={[{ gap: 12 }, c.state !== 'active' && c.state !== 'attached' && !canReview(c) && { opacity: 0.6 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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
              </View>
              {canReview(c) && <Button title="Değerlendir" icon="star-outline" size="sm" onPress={() => setReviewing(c)} />}
            </Card>
          ))
        )}
      </ScrollView>
      <ReviewSheet
        appointment={reviewing && { id: reviewing.claim_id, businesses: { name: reviewing.business_name } }}
        submit={(rating, comment) => supabase.rpc('add_coupon_review', { p_claim_id: reviewing!.claim_id, p_rating: rating, p_comment: comment })}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          load();
        }}
      />
    </View>
  );
}
