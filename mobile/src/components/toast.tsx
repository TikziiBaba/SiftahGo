import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { colors, radius, shadows } from '@/lib/theme';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; text: string; tone: Tone };

const TONES = {
  success: { icon: 'checkmark-circle', color: colors.success },
  error: { icon: 'alert-circle-outline', color: colors.danger },
  info: { icon: 'information-circle-outline', color: colors.brand300 },
} as const;

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

/** "Kaydedildi" gibi kısa bildirimler. Açık bir alt pencerenin (Modal) üstünde görünmez. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((text: string, tone: Tone = 'success') => {
    if (tone === 'success') haptic.success();
    if (tone === 'error') haptic.error();
    setToast({ id: Date.now(), text, tone });
  }, []);

  const t = toast ? TONES[toast.tone] : null;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && t && (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(180)}
          style={[s.toast, { top: insets.top + 8 }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert">
          <Ionicons name={t.icon} size={20} color={t.color} />
          <Text variant="label" style={{ flexShrink: 1 }}>
            {toast.text}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    boxShadow: shadows.float,
    pointerEvents: 'none',
  },
});
