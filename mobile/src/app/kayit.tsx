import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, Field, styles } from '@/components/ui';
import { colors, WEB_URL } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const params = useLocalSearchParams<{ rol?: string }>();
  const [role, setRole] = useState<'customer' | 'business'>(params.rol === 'isletme' ? 'business' : 'customer');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<'check-email' | 'business-ready' | null>(null);

  async function submit() {
    setBusy(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), phone: form.phone.trim(), role },
        emailRedirectTo: `${WEB_URL}/auth/callback?next=${role === 'business' ? '/panel' : '/hesabim'}`,
      },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    if (!data.session) return setResult('check-email');
    if (role === 'business') return setResult('business-ready');
    router.back();
  }

  if (result) {
    return (
      <View style={[styles.content, { paddingTop: 32 }]}>
        <Card style={{ gap: 10 }}>
          <Text style={styles.h2}>{result === 'check-email' ? 'E-postanızı kontrol edin' : 'Hesabınız hazır'}</Text>
          <Text style={styles.muted}>
            {result === 'check-email'
              ? `${form.email} adresine doğrulama bağlantısı gönderdik. Doğruladıktan sonra giriş yapabilirsiniz.`
              : 'İşletme bilgilerinizi, hizmetlerinizi ve çalışma saatlerinizi web panelinden ekleyin. Randevularınızı bu uygulamadan takip edebilirsiniz.'}
          </Text>
          <Button title="Tamam" onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { gap: 14 }]} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            ['customer', 'Randevu almak istiyorum'],
            ['business', 'İşletmem var'],
          ] as const).map(([value, text]) => (
            <Pressable
              key={value}
              onPress={() => setRole(value)}
              style={[styles.card, { flex: 1, alignItems: 'center' }, role === value && { borderColor: colors.brand, backgroundColor: colors.brandLight }]}>
              <Text style={{ fontWeight: '600', color: role === value ? colors.brandDark : colors.muted, textAlign: 'center' }}>{text}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Ad Soyad" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" />
        <Field label="Telefon" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
        <Field label="E-posta" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Şifre (en az 6 karakter)" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title={role === 'business' ? 'İşletme Hesabı Aç' : 'Hesap Aç'} onPress={submit} loading={busy} />
        <Button title="Zaten hesabın var mı? Giriş yap" variant="ghost" onPress={() => router.replace('/giris')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
