import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { useCaptcha } from '@/components/turnstile';
import { Banner, Button, Empty, Field, styles } from '@/components/ui';
import { WEB_URL } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const captcha = useCaptcha();

  async function submit() {
    if (!email.trim()) return setError('E-posta adresinizi yazın.');
    setBusy(true);
    setError('');
    // Yeni şifre web sitesinde belirlenir (web ile aynı akış).
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${WEB_URL}/auth/callback?next=/sifre-yenile`,
      captchaToken: captcha.token,
    });
    setBusy(false);
    if (error) {
      captcha.retry();
      return setError(errorMessage(error));
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <Empty
          icon="mail-unread-outline"
          title="E-postanızı kontrol edin"
          text={`${email.trim()} adresine şifre yenileme bağlantısı gönderdik. Bağlantıyı açıp yeni şifrenizi belirleyin, ardından uygulamadan giriş yapın.`}>
          <Button title="Giriş ekranına dön" onPress={() => router.back()} />
        </Empty>
      </View>
    );
  }

  return (
    <AuthShell
      title="Şifrenizi mi"
      accent="unuttunuz?"
      subtitle="Hesabınızın e-posta adresini yazın, size yenileme bağlantısı gönderelim."
      onBack={() => router.back()}>
      <Field
        label="E-posta"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        onSubmitEditing={submit}
        returnKeyType="send"
      />
      {captcha.widget}
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Button title="Bağlantı gönder" size="lg" onPress={submit} loading={busy} disabled={!captcha.ready} />
    </AuthShell>
  );
}
