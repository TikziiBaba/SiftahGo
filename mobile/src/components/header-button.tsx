import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';

import type { IconName } from '@/lib/constants';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/** Üst çubuktaki ikon düğmesi (ekle, kaydet vb.) */
export function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.press();
        onPress();
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={26} color={colors.brand300} />
    </Pressable>
  );
}
