import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Android'de Vibrator yerine sistemin dokunsal geri bildirimi kullanılır; web'de titreşim yok.
const android = (type: Haptics.AndroidHaptics) => Haptics.performAndroidHapticsAsync(type);

function run(ios: () => Promise<void>, androidType: Haptics.AndroidHaptics) {
  if (Platform.OS === 'web') return;
  (Platform.OS === 'android' ? android(androidType) : ios()).catch(() => {});
}

export const haptic = {
  /** Seçim değişti (gün, saat, sekme) */
  select: () => run(() => Haptics.selectionAsync(), Haptics.AndroidHaptics.Segment_Tick),
  /** Buton basışı */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), Haptics.AndroidHaptics.Virtual_Key),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), Haptics.AndroidHaptics.Confirm),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), Haptics.AndroidHaptics.Reject),
};
