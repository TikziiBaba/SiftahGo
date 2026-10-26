import { useCallback } from 'react';
import { StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { colors } from '@/lib/theme';

const BAR = 52;

/** Listenin kaydırma konumu: listeye {...scroll} verilir, TopBar aynı değeri okur. */
export function useScrollY() {
  const y = useSharedValue(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => y.set(e.nativeEvent.contentOffset.y), [y]);
  return { y, scroll: { onScroll, scrollEventThrottle: 16 } };
}

/**
 * Kaydırınca beliren üst çubuk: içerik saatin altına girmeye başlayınca durum çubuğunun zemini, büyük başlık
 * kaybolunca (after) küçük başlıklı çubuk belirir. cover: ekranın üstünde kapak görseli var; zemin başlıkla birlikte
 * gelir, görseli erken kapatmaz. left: başlığın soldan boşluğu (yüzen geri düğmesi varsa). Dokunuşları içeriğe geçirir.
 */
export function TopBar({ y, title, after = 56, cover, left = 16 }: { y: SharedValue<number>; title: string; after?: number; cover?: boolean; left?: number }) {
  const insets = useSafeAreaInsets();
  const strip = useAnimatedStyle(() => ({ opacity: cover ? 0 : interpolate(y.get(), [0, 16], [0, 1], Extrapolation.CLAMP) }));
  const bar = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [after - 24, after], [0, 1], Extrapolation.CLAMP) }));
  const label = useAnimatedStyle(() => {
    const v = interpolate(y.get(), [after - 8, after + 12], [0, 1], Extrapolation.CLAMP);
    return { opacity: v, transform: [{ translateY: 6 * (1 - v) }] };
  });
  return (
    <View pointerEvents="none" style={[s.wrap, { height: insets.top + BAR }]}>
      <Animated.View style={[s.backdrop, { height: insets.top }, strip]} />
      <Animated.View style={[s.backdrop, s.line, { height: insets.top + BAR }, bar]} />
      <Animated.View style={[s.title, { top: insets.top, left }, label]}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  title: { position: 'absolute', right: 16, height: BAR, justifyContent: 'center' },
});
