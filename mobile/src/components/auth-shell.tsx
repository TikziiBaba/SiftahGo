import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glow, LogoMark } from '@/components/brand';
import { EASE_SPRING, Float, GridFlow, Reveal } from '@/components/motion';
import { Banner, Button, Field, IconButton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { googleEnabled, signInWithGoogle } from '@/lib/google';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/** Klavye açık mı (web'de klavye olayı yok, hep kapalı sayılır). */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/**
 * Giriş / kayıt / şifre sıfırlama ekranlarının ortak çerçevesi. Kaydırılmaz, tek ekrana sığar: form altta,
 * kalan yer başlığın. Klavye açılınca başlık çekilir, form klavyenin üstünde kalır. heroKey değişince başlık yenilenir.
 */
export function AuthShell({
  title,
  accent,
  subtitle,
  heroKey,
  onBack,
  children,
}: {
  title: string;
  accent?: string;
  subtitle: string;
  heroKey?: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.floor, { top: insets.top }]}>
        <GridFlow height={300} />
      </View>
      {/* Işık ızgaranın üstünde: ızgaranın solan üst kenarı ışığı kesmesin. */}
      <Glow height={420} opacity={0.24} />
      <View style={[s.frame, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
        {onBack ? <IconButton icon="chevron-back" label="Geri" onPress={onBack} style={[s.back, { top: insets.top + 8 }]} /> : null}
        {/* Açılışta başlık Reveal ile gelir; solma yalnızca klavye açılıp kapanınca. */}
        <LayoutAnimationConfig skipEntering>
          {!keyboard && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={s.hero}>
              <Float>
                <LogoMark size={52} />
              </Float>
              <Reveal key={heroKey} offset={12} style={{ gap: 8 }}>
                <Text variant="display">
                  {title}
                  {accent ? (
                    <Text variant="display" tone="brand">
                      {'\n'}
                      {accent}
                    </Text>
                  ) : null}
                </Text>
                <Text tone="muted">{subtitle}</Text>
              </Reveal>
            </Animated.View>
          )}
        </LayoutAnimationConfig>
        <Animated.View layout={LinearTransition.duration(300).easing(EASE_SPRING)} style={s.form}>
          {children}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * "Google ile devam et" ve altında "veya e-posta ile" ayırıcı. Oturum açılınca giriş ekranları
 * kendiliğinden kapanır. `business`: hesap işletme hesabı olur, kurulum ekranı açılır.
 */
export function GoogleButton({ business }: { business?: boolean }) {
  const { refresh } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    googleEnabled().then(setEnabled);
  }, []);

  async function go() {
    setBusy(true);
    setError('');
    try {
      if ((await signInWithGoogle(business)) && business) await refresh();
    } catch (e) {
      haptic.error();
      setError(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <View style={{ gap: 14 }}>
      <Button title="Google ile devam et" icon="logo-google" variant="secondary" size="lg" onPress={go} loading={busy} />
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
        <Text variant="caption" tone="muted">
          veya e-posta ile
        </Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
      </View>
    </View>
  );
}

export function PasswordField(props: React.ComponentProps<typeof Field>) {
  const [show, setShow] = useState(false);
  return (
    <Field
      icon="lock-closed-outline"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!show}
      right={
        <Pressable onPress={() => setShow(!show)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? 'Şifreyi gizle' : 'Şifreyi göster'}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.ink3} />
        </Pressable>
      }
    />
  );
}

const s = StyleSheet.create({
  floor: { position: 'absolute', left: 0, right: 0, height: 300 },
  frame: { flex: 1, paddingHorizontal: 20, justifyContent: 'flex-end', gap: 20 },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  // Kısa ekranda önce başlık daralır (taşanı gizlenir), form hep tam görünür.
  hero: { flex: 1, minHeight: 0, justifyContent: 'flex-end', gap: 16, overflow: 'hidden' },
  form: { gap: 12 },
});
