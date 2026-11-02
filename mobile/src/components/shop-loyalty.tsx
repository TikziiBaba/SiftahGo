import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Banner, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { MyLoyalty } from '@/lib/types';

/** İşletme sayfasındaki sadakat kartı (web ile aynı). Kural kapalıysa görünmez. */
export function ShopLoyalty({ businessId }: { businessId: string }) {
  const [card, setCard] = useState<MyLoyalty | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc('my_loyalty', { p_business_id: businessId }).then(({ data }) => {
      if (active) setCard((data as MyLoyalty | null) ?? null);
    });
    return () => {
      active = false;
    };
  }, [businessId]);

  if (!card) return null;
  const left = card.target - card.stamps;

  return (
    <Card style={{ gap: 10, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="gift-outline" size={18} color={colors.brand300} />
        <Text variant="bodyStrong">Sadakat kartı</Text>
      </View>
      {card.available > 0 && <Banner tone="success" icon="gift-outline" text={`Ödülünüz hazır: ${card.reward}. Gelişinizde işletmeye söyleyin.`} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={`${card.stamps} / ${card.target} damga`}>
        {Array.from({ length: card.target }, (_, i) => (
          <View
            key={i}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: i < card.stamps ? colors.brand300 : colors.line,
            }}
          >
            {i < card.stamps ? <Ionicons name="checkmark" size={14} color={colors.brand300} /> : <Text variant="caption" tone="muted">{i + 1}</Text>}
          </View>
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {left === 1 ? 'Bir sonraki randevunuzda' : `${left} randevu sonra`}: {card.reward}
      </Text>
    </Card>
  );
}
