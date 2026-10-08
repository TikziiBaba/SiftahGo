import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text } from 'react-native';

import { Button, Field, styles } from '@/components/ui';
import { WEB_URL } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { gap: 14 }]} keyboardShouldPersistTaps="handled">
        <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Giriş Yap" onPress={submit} loading={busy} />
        <Button title="Şifremi unuttum" variant="ghost" onPress={() => Linking.openURL(`${WEB_URL}/sifremi-unuttum`)} />
        <Button title="Hesabın yok mu? Kayıt ol" variant="ghost" onPress={() => router.replace('/kayit')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
