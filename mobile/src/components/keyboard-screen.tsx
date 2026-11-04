import { useHeaderHeight } from 'expo-router/react-navigation';
import { KeyboardAvoidingView, type StyleProp, type ViewStyle } from 'react-native';

import { styles } from '@/components/ui';

/**
 * Klavye açılınca içeriği yukarı iten ekran kabı. Android kenardan kenara çalıştığı için pencere
 * klavyeye göre küçülmez; behavior iki platformda da verilmeli, yoksa alanlar klavyenin altında kalır.
 */
export function KeyboardScreen({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const header = useHeaderHeight();
  return (
    <KeyboardAvoidingView style={style ?? styles.screen} behavior="padding" keyboardVerticalOffset={header}>
      {children}
    </KeyboardAvoidingView>
  );
}
