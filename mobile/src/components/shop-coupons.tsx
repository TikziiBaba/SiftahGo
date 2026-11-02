import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useToast } from '@/components/toast';
import { Banner, Button, Card, SectionTitle, Text } from '@/components/ui';
import { useAccent } from '@/lib/accent';
import { formatCouponWhen, formatDiscount, useShopCoupons } from '@/lib/coupons';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/** İşletme sayfasındaki kuponlar (web: components/shop-coupons.tsx). "Kuponu al" girişsizse girişe götürür; alınan kuponun kodu görünür. */
export function ShopCoupons({
  businessId,
  services,
  showcase = false,
}: {
  businessId: string;
  services: { id: string; name: string }[];
  /** Randevusuz işletme: kod kasada gösterilir, hizmet listesi yoktur. */
  showcase?: boolean;
}) {
  const accent = useAccent();
  const toast = useToast();
  const { coupons, claims, loggedIn, refresh } = useShopCoupons(businessId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function claim(id: string) {
    if (!loggedIn) return router.push('/giris');
    setBusyId(id);
    setError('');
    const { error } = await supabase.rpc('claim_coupon', { p_coupon_id: id });
    setBusyId(null);
    if (error) setError(errorMessage(error));
    else toast('Kuponu aldınız; kodu kartta.');
    refresh();
  }

  if (coupons.length === 0) return null;
  return (
    <>
      <SectionTitle title="Kuponlar" />
      {coupons.map((c) => {
        const mine = claims.find((x) => x.coupon_id === c.id);
        const soldOut = !mine && c.total_limit !== null && c.claimed_count >= c.total_limit;
        const names = showcase ? [] : c.service_ids.flatMap((id) => services.find((s) => s.id === id)?.name ?? []);
        return (
          <Card key={c.id} style={{ gap: 4 }}>
            <Text variant="bodyStrong">{c.title}</Text>
            <Text variant="label" style={{ color: accent.soft }}>
              {formatDiscount(c)}
            </Text>
            <Text variant="caption" tone="muted">
              {formatCouponWhen(c)}
            </Text>
            {names.length > 0 && (
              <Text variant="caption" tone="muted">
                Geçerli: {names.join(', ')}
              </Text>
            )}
            <View style={{ marginTop: 8 }}>
              {mine ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text tone="secondary">Kodunuz</Text>
                  <Text variant="title" style={{ color: accent.soft, letterSpacing: 3, fontVariant: ['tabular-nums'] }}>
                    {mine.code}
                  </Text>
                  {mine.state === 'attached' && (
                    <Text variant="caption" tone="muted">
                      Randevuya bağlı
                    </Text>
                  )}
                  {mine.state === 'used' && (
                    <Text variant="caption" tone="muted">
                      Kullanıldı
                    </Text>
                  )}
                </View>
              ) : soldOut ? (
                <Text tone="muted">Hakkı tükendi</Text>
              ) : (
                <Button title="Kuponu al" size="sm" variant="secondary" loading={busyId === c.id} onPress={() => claim(c.id)} />
              )}
            </View>
          </Card>
        );
      })}
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Text variant="caption" tone="muted">
        {showcase ? 'Kasada kodu gösterin. Kuponu kullandıktan sonra işletmeyi Kuponlarım’dan değerlendirebilirsiniz.' : 'Kodu randevu alırken seçin ya da kasada gösterin.'}
      </Text>
    </>
  );
}
