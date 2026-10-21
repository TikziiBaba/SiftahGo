import { useEffect } from 'react';
import { StyleSheet, View, type CellRendererProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { useSvgId } from '@/components/brand';
import { colors } from '@/lib/theme';

// Web sitesindeki hareketler (web/src/app/globals.css). "Hareketi azalt" açıksa Reanimated bunları
// kendiliğinden atlar: belirme beklemeden görünür, yüzme ve ızgara durur.

/** Web'deki yay eğrisi (--ease-spring) */
export const EASE_SPRING = Easing.bezier(0.32, 0.72, 0, 1);

/**
 * Belirme (web: reveal-in): aşağıdan yükselir, soluktan netleşir. index: listede sıra; ilk sekiz öğe birbiri
 * ardına gelir, kaydırınca sonradan görünenler beklemez. key değişince yeniden oynar (içerik değişimi).
 * Web'deki giriş animasyonu altyapısı yönlendirmeyle açılan ekranlarda takıldığı için paylaşılan değerle yazıldı.
 */
export function Reveal({
  index = 0,
  offset = 24,
  style,
  onLayout,
  children,
}: {
  index?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(index < 8 ? index * 60 : 0, withTiming(1, { duration: 700, easing: EASE_SPRING })));
  }, [p, index]);
  const animated = useAnimatedStyle(() => {
    const v = p.get();
    return { opacity: v, transform: [{ translateY: offset * (1 - v) }, { scale: 0.98 + 0.02 * v }] };
  });
  return (
    <Animated.View style={[style, animated]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

/** FlatList satırları açılışta sırayla belirir: CellRendererComponent={RevealCell} */
export function RevealCell({ index, style, onLayout, children }: CellRendererProps<unknown>) {
  return (
    <Reveal index={index} style={style} onLayout={onLayout}>
      {children}
    </Reveal>
  );
}

/** Hafif yüzme (web: animate-float). delay: yan yana öğeler aynı anda inip kalkmasın. */
export function Float({ delay = 0, distance = 8, style, children }: { delay?: number; distance?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(delay, withRepeat(withTiming(-distance, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [y, delay, distance]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const CELL = 56;

/** Ufka doğru akan perspektif ızgara (web: GridFloor). Üstü zemine doğru solar. */
export function GridFlow({ height = 280, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const grid = useSvgId();
  const fade = useSvgId();
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withRepeat(withTiming(CELL, { duration: 2400, easing: Easing.linear }), -1, false));
  }, [y]);
  const flow = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <View pointerEvents="none" aria-hidden style={[s.grid, { height }, style]}>
      <View style={[s.plane, { height: height * 2.2 }]}>
        <Animated.View style={[s.flow, flow]}>
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern id={grid} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                <Path d={`M${CELL} 0H0V${CELL}`} stroke={colors.brand} strokeOpacity={0.2} strokeWidth={1} fill="none" />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${grid})`} />
          </Svg>
        </Animated.View>
      </View>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="0.85" stopColor={colors.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${fade})`} />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  plane: {
    position: 'absolute',
    left: '-50%',
    right: '-50%',
    bottom: 0,
    transformOrigin: 'bottom',
    transform: [{ perspective: 520 }, { rotateX: '74deg' }],
  },
  flow: { position: 'absolute', left: 0, right: 0, top: -CELL, bottom: 0 },
});
