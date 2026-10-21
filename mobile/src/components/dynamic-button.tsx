import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale, Text } from '@/components/ui';
import { useAccent } from '@/lib/accent';
import type { IconName } from '@/lib/constants';
import { haptic } from '@/lib/haptics';
import { alpha, radius } from '@/lib/theme';

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
// "Hareketi azalt" açıksa yazılar ve genişlik beklemeden yer değiştirir (Reanimated varsayılanı).
const SWAP = { duration: 220, easing: EASE };
const RESIZE = { duration: 280, easing: EASE };

type Label = { title: string; icon?: IconName; loading?: boolean };

/**
 * Yazısı değişince genişliği yumuşakça uyan birincil düğme (Kaydet → Kaydediliyor → Kaydedildi): eski yazı
 * yukarı çıkarken yenisi alttan gelir. İkon yazıyla birlikte değişir; loading ikonun yerine dönen gösterge koyar
 * ve düğmeyi pasif yapar. Geçiş giriş/çıkış animasyonuyla değil tek ilerleme değeriyle: web'de de aynı çalışsın.
 */
export function DynamicButton({
  title,
  icon,
  loading,
  disabled,
  onPress,
  style,
}: Label & {
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = useAccent();
  const width = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  // Yazı değişince öncekisi çıkış için saklanır.
  const [shown, setShown] = useState<Label>({ title, icon, loading });
  const [previous, setPrevious] = useState<Label | null>(null);
  if (shown.title !== title) {
    setPrevious(shown);
    setShown({ title, icon, loading });
  }
  const swap = useSharedValue(1);
  useEffect(() => {
    if (!previous) return;
    swap.set(0);
    swap.set(withTiming(1, SWAP));
  }, [swap, previous]);

  const track = useAnimatedStyle(() => ({ width: width.get() }));
  const enter = useAnimatedStyle(() => ({ opacity: swap.get(), transform: [{ translateY: 10 * (1 - swap.get()) }] }));
  const leave = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - swap.get() * 1.4), transform: [{ translateY: -10 * swap.get() }] }));
  const content = (l: Label) => (
    <>
      {l.loading ? <ActivityIndicator size="small" color={accent.ink} /> : l.icon ? <Ionicons name={l.icon} size={18} color={accent.ink} /> : null}
      <Text variant="bodyStrong" style={{ color: accent.ink }} numberOfLines={1}>
        {l.title}
      </Text>
    </>
  );
  const current = content({ title, icon, loading });

  return (
    <PressableScale
      onPress={() => {
        haptic.press();
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[s.box, { backgroundColor: accent.base, boxShadow: `0 8px 24px -8px ${alpha(accent.base, 0.55)}` }, disabled && { opacity: 0.4, boxShadow: undefined }, style]}>
      {/* Görünmeyen kopya yeni yazının genişliğini verir; görünen yazının alanı bu genişliğe kayar. */}
      <View style={s.measure} pointerEvents="none" aria-hidden>
        <View
          style={s.fit}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            // İlk ölçümde kaydırmadan yerine koy.
            width.set(measured ? withTiming(w, RESIZE) : w);
            setMeasured(true);
          }}>
          {current}
        </View>
      </View>
      {measured ? (
        <Animated.View style={[s.track, track]}>
          {previous ? (
            <Animated.View style={[s.label, leave]} aria-hidden>
              {content(previous)}
            </Animated.View>
          ) : null}
          <Animated.View style={[s.label, enter]}>{current}</Animated.View>
        </Animated.View>
      ) : (
        current
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  box: {
    height: 54,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  // Düğmeden geniş olduğu için içindeki yazı hiç kırılmadan doğal genişliğini alır.
  measure: { position: 'absolute', top: 0, left: 0, width: 2000, opacity: 0 },
  fit: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8 },
  track: { height: 24 },
  // Alan daralırken de yazı kırılmasın diye iki yana taşan, ortalanmış katman
  label: { position: 'absolute', top: 0, bottom: 0, left: -120, right: -120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
