import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useAccent } from '@/lib/accent';
import { alpha, colors, fonts } from '@/lib/theme';
import type { Business } from '@/lib/types';

/** Logo yoksa baş harf; renkleri sayfa renginden (dükkân sayfası dışında turkuaz). */
export function Logo({ business, size }: { business: Pick<Business, 'name' | 'logo_url'>; size: number }) {
  const accent = useAccent();
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  if (business.logo_url) {
    // Logo her yerde işletme adının yanında durur; ekran okuyucu için süs. Web'de alt="" olur
    // (expo-image asıl görselde alt yerine yalnızca accessibilityLabel okuyor).
    return <Image source={business.logo_url} accessibilityLabel="" style={[box, { backgroundColor: colors.surface2 }]} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[box, { backgroundColor: accent.deep, borderWidth: 1, borderColor: alpha(accent.base, 0.25), alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: accent.light, fontFamily: fonts.bold, fontSize: size / 2.5 }}>{business.name.charAt(0)}</Text>
    </View>
  );
}
