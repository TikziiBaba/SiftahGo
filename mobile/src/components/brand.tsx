import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useAccent } from '@/lib/accent';
import { colors, shadows } from '@/lib/theme';

/** SVG gradyan kimliği; web'de belge genelinde benzersiz olmalı. */
function useSvgId() {
  return `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Ekranın üstündeki turkuaz ışık (web: radial-gradient(ellipse_at_top, ...)) */
export function Glow({ height = 340, opacity = 0.2, style }: { height?: number; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const id = useSvgId();
  return (
    <View style={[s.glow, { height }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="0%" rx="80%" ry="100%" fx="50%" fy="0%">
            <Stop offset="0" stopColor={colors.brand500} stopOpacity={opacity} />
            <Stop offset="1" stopColor={colors.brand500} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Web'deki logo: turkuaz degrade kare, takvim işareti ve altın nokta */
export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useSvgId();
  const dot = Math.round(size * 0.24);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.brand300} />
            <Stop offset="0.5" stopColor={colors.brand500} />
            <Stop offset="1" stopColor={colors.brand800} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} rx={size * 0.3} fill={`url(#${id})`} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        <MaterialCommunityIcons name="calendar-check-outline" size={Math.round(size * 0.56)} color={colors.brandInk} />
      </View>
      <View style={[s.dot, { width: dot, height: dot, borderRadius: dot / 2 }]} />
    </View>
  );
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LogoMark size={size} />
      <Text variant={size > 36 ? 'title' : 'heading'}>SiftahGo</Text>
    </View>
  );
}

/** İşletme kapak görseli; yoksa koyu turkuaz degrade. */
export function Cover({ uri, height, style }: { uri?: string | null; height: number; style?: StyleProp<ViewStyle> }) {
  const id = useSvgId();
  const accent = useAccent();
  return (
    <View style={[{ height, backgroundColor: colors.surface2, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={accent.deep} />
            <Stop offset="1" stopColor={colors.surface2} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {uri ? <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.gold,
    boxShadow: shadows.goldDot,
  },
});
