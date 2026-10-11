import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Glow, LogoMark } from '@/components/brand';
import { Banner, Button, Field, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { googleEnabled, signInWithGoogle } from '@/lib/google';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/** Giriş / kayıt / şifre sıfırlama ekranlarının ortak çerçevesi */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Glow height={380} opacity={0.24} />
      <ScrollView contentContainerStyle={[styles.content, { gap: 14, paddingTop: 8 }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10, marginBottom: 8 }}>
          <LogoMark size={48} />
          <Text variant="display">{title}</Text>
          <Text tone="muted">{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
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
