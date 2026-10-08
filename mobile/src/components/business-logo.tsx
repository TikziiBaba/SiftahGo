import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { colors } from '@/lib/constants';
import type { Business } from '@/lib/types';

export function Logo({ business, size }: { business: Pick<Business, 'name' | 'logo_url'>; size: number }) {
  if (business.logo_url) {
    return <Image source={business.logo_url} style={{ width: size, height: size, borderRadius: size / 4 }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size / 2.6 }}>{business.name.charAt(0)}</Text>
    </View>
  );
}
