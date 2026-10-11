import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell, GoogleButton, PasswordField } from '@/components/auth-shell';
import { Banner, Button, Field, Text } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password) return setError('E-posta ve şifrenizi yazın.');
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    router.back();
  }

  return (
    <AuthShell title="Tekrar hoş geldiniz" subtitle="Randevularınıza ve işletmenize ulaşmak için giriş yapın.">
      <GoogleButton />
      <Field
        label="E-posta"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <PasswordField label="Şifre" value={password} onChangeText={setPassword} autoComplete="current-password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
      <View style={{ alignItems: 'flex-end', marginTop: -4 }}>
        <Button title="Şifremi unuttum" variant="ghost" size="sm" onPress={() => router.push('/sifremi-unuttum')} />
      </View>
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Button title="Giriş Yap" size="lg" onPress={submit} loading={busy} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <Text tone="muted">Hesabınız yok mu?</Text>
        <Button title="Kayıt olun" variant="ghost" size="sm" onPress={() => router.replace('/kayit')} />
      </View>
    </AuthShell>
  );
}
