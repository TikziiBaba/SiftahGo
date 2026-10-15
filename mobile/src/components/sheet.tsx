import { useEffect, useMemo } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Extrapolation, interpolate, SlideInDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Text } from '@/components/ui';
import { colors, radius } from '@/lib/theme';

// Bırakılınca kapanma eşiği: bu kadar aşağı çekilirse ya da hızla savrulursa
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.9;
const BACK = { damping: 22, stiffness: 260 };

/** Alttan açılan pencere. Uzun formlar için ayrı ekran kullanın; burası seçim ve kısa işlemler için. */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  tall,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Kaydırılan içeriğin altında sabit kalan butonlar */
  footer?: React.ReactNode;
  /** Uzun listeler (şehir seçimi gibi) için ekranın büyük kısmını kaplar */
  tall?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Tutamaçtan ya da başlıktan aşağı sürüklenince pencere parmağı izler; yeterince çekilince kapanır.
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) drag.set(0);
  }, [visible, drag]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Dokunma (kapat düğmesi) değil, belirgin dikey çekiş yakalanır.
        onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.set(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
            drag.set(withTiming(height, { duration: 220 }));
            onClose();
          } else {
            drag.set(withSpring(0, BACK));
          }
        },
        onPanResponderTerminate: () => drag.set(withSpring(0, BACK)),
      }),
    [drag, height, onClose],
  );
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drag.get(), [0, height * 0.5], [1, 0.3], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={panelStyle}>
            <Animated.View
              entering={SlideInDown.duration(280)}
              style={[s.panel, { maxHeight: height * 0.9, paddingBottom: Math.max(insets.bottom, 16) }, tall && { height: height * 0.85 }]}>
              <View {...pan.panHandlers}>
                <View style={s.handle} />
                {title ? (
                  <View style={s.header}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="heading">{title}</Text>
                      {subtitle ? (
                        <Text variant="caption" tone="muted">
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <IconButton icon="close" label="Kapat" onPress={onClose} size={34} />
                  </View>
                ) : null}
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
                {children}
              </ScrollView>
              {footer ? <View style={s.footer}>{footer}</View> : null}
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
