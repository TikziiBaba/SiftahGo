import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale, Text } from '@/components/ui';
import type { IconName } from '@/lib/constants';
import { haptic } from '@/lib/haptics';
import { alpha, colors, radius } from '@/lib/theme';

const HOLD_MS = 900;

// Dolum ve boşalma ilerleme göstergesi; "hareketi azalt" açıkken de akar, yoksa ne kadar tutulduğu görünmez.
const PROGRESS = { easing: Easing.linear, reduceMotion: ReduceMotion.Never };
// Erken bırakınca ya da geri alınca dolum hızla geri sarılır.
const REWIND = { duration: 250, easing: Easing.out(Easing.cubic) };

type Phase = 'idle' | 'holding' | 'hint' | 'pending' | 'running';

/**
 * Basılı tutarak onaylanan düğme (Alert yerine). Erken bırakılırsa dolum geri sarılır ve "Basılı tutun" yazar.
 * Dolunca işlem hemen yapılmaz: düğme undoSeconds boyunca "Geri al N" olur ve dolum geri sayımla boşalır; dokunmak
 * vazgeçirir, süre bitince onConfirm çalışır. Bu sırada bileşen kalkarsa (liste değişti) işlem yine yapılır.
 */
export function HoldButton({
  title,
  pending,
  onConfirm,
  icon,
  undoSeconds = 4,
  style,
}: {
  title: string;
  /** İşlem sürerken görünen yazı, örn. "İptal ediliyor" */
  pending: string;
  onConfirm: () => unknown;
  icon?: IconName;
  undoSeconds?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [left, setLeft] = useState(undoSeconds);
  const fill = useSharedValue(0);
  // Basma olayları yeniden çizimi beklemeden güncel aşamayı görsün diye aşama ref'te de tutulur.
  const at = useRef<Phase>('idle');
  const confirmRef = useRef(onConfirm);
  const go = useCallback((next: Phase) => {
    at.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    confirmRef.current = onConfirm;
  });

  // Geri al süresi bitmeden bileşen kalkarsa işlem yine yapılır.
  useEffect(
    () => () => {
      if (at.current === 'pending') {
        at.current = 'idle';
        confirmRef.current();
      }
    },
    [],
  );

  useEffect(() => {
    if (phase === 'hint') {
      const timer = setTimeout(() => go('idle'), 1500);
      return () => clearTimeout(timer);
    }
    if (phase !== 'pending') return;
    const ends = Date.now() + undoSeconds * 1000;
    const timer = setInterval(() => {
      const rest = Math.ceil((ends - Date.now()) / 1000);
      if (rest > 0) return setLeft(rest);
      clearInterval(timer);
      go('running');
      Promise.resolve(confirmRef.current()).finally(() => go('idle'));
    }, 200);
    return () => clearInterval(timer);
  }, [phase, undoSeconds, go]);

  function hold() {
    if (at.current !== 'idle' && at.current !== 'hint') return;
    haptic.press();
    go('holding');
    fill.set(withTiming(1, { duration: HOLD_MS, ...PROGRESS }));
  }

  function release() {
    if (at.current !== 'holding') return;
    fill.set(withTiming(0, REWIND));
    go('hint');
  }

  // Doldu (ya da ekran okuyucuyla çift dokunuldu): geri sayım başlar.
  function arm() {
    if (at.current === 'pending' || at.current === 'running') return;
    haptic.success();
    setLeft(undoSeconds);
    go('pending');
    fill.set(1);
    fill.set(withTiming(0, { duration: undoSeconds * 1000, ...PROGRESS }));
  }

  function undo() {
    if (at.current !== 'pending') return;
    haptic.select();
    fill.set(withTiming(0, REWIND));
    go('idle');
  }

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  const label = phase === 'pending' ? `Geri al ${left}` : phase === 'running' ? pending : phase === 'hint' ? 'Basılı tutun' : title;

  return (
    <PressableScale
      onPressIn={hold}
      onPressOut={release}
      onLongPress={() => at.current === 'holding' && arm()}
      delayLongPress={HOLD_MS}
      onPress={undo}
      disabled={phase === 'running'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={phase === 'pending' ? 'Vazgeçmek için dokunun' : `Onaylamak için basılı tutun, ${undoSeconds} saniye içinde geri alabilirsiniz`}
      accessibilityState={{ busy: phase === 'running' }}
      // Ekran okuyucuda basılı tutmak zor: çift dokunuş doğrudan geri sayımı başlatır ya da geri alır.
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => (at.current === 'pending' ? undo() : arm())}
      style={[s.box, style]}>
      <Animated.View style={[s.fill, fillStyle]} />
      {phase === 'running' ? (
        <ActivityIndicator size="small" color={colors.danger} />
      ) : phase === 'pending' ? (
        <Ionicons name="arrow-undo" size={16} color={colors.danger} />
      ) : icon ? (
        <Ionicons name={icon} size={16} color={colors.danger} />
      ) : null}
      <Text variant="label" tone="danger" numberOfLines={1} selectable={false} style={{ fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  box: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    backgroundColor: colors.dangerTint,
  },
  fill: { ...StyleSheet.absoluteFill, transformOrigin: 'left', backgroundColor: alpha(colors.danger, 0.2) },
});
