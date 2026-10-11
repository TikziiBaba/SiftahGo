import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell, GoogleButton, PasswordField } from '@/components/auth-shell';
import { Banner, Button, Empty, Field, styles, Text } from '@/components/ui';
import { WEB_URL, type IconName } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

const ROLES: { value: 'customer' | 'business'; title: string; text: string; icon: IconName }[] = [
  { value: 'customer', title: 'Randevu alacağım', text: 'Müşteri hesabı', icon: 'person-outline' },
  { value: 'business', title: 'İşletmem var', text: 'Randevu kabul edin', icon: 'storefront-outline' },
];

export default function SignupScreen() {
  const params = useLocalSearchParams<{ rol?: string }>();
  const [role, setRole] = useState<'customer' | 'business'>(params.rol === 'isletme' ? 'business' : 'customer');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  async function submit() {
    if (form.full_name.trim().length < 2) return setError('Adınızı ve soyadınızı yazın.');
    if (!form.email.trim()) return setError('E-posta adresinizi yazın.');
    if (form.password.length < 6) return setError('Şifre en az 6 karakter olmalı.');
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
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    if (!data.session) return setSentTo(form.email.trim());
    // Oturum açıldı: işletme hesabı kurulum ekranına kendiliğinden yönlenir.
    router.back();
  }

  if (sentTo) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <Empty icon="mail-unread-outline" title="E-postanızı kontrol edin" text={`${sentTo} adresine doğrulama bağlantısı gönderdik. Doğruladıktan sonra uygulamadan giriş yapabilirsiniz.`}>
          <Button title="Giriş ekranına git" onPress={() => router.replace('/giris')} />
        </Empty>
      </View>
    );
  }

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <AuthShell title="Hesap oluşturun" subtitle="Birkaç bilgiyle bir dakikada hazır.">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {ROLES.map((r) => {
          const on = role === r.value;
          return (
            <Pressable
              key={r.value}
              onPress={() => {
                haptic.select();
                setRole(r.value);
              }}
              accessibilityRole="radio"
              aria-checked={on}
              style={[s.role, on && s.roleOn]}>
              <Ionicons name={r.icon} size={22} color={on ? colors.brand300 : colors.ink3} />
              <Text variant="bodyStrong" tone={on ? 'default' : 'secondary'}>
                {r.title}
              </Text>
              <Text variant="caption" tone="muted">
                {r.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <GoogleButton business={role === 'business'} />
      <Field label="Ad Soyad" icon="person-outline" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" textContentType="name" />
      <Field label="Telefon" icon="call-outline" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="05xx xxx xx xx" autoComplete="tel" />
      <Field
        label="E-posta"
        icon="mail-outline"
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <PasswordField label="Şifre" value={form.password} onChangeText={set('password')} autoComplete="new-password" textContentType="newPassword" hint="En az 6 karakter" />
      {role === 'business' && (
        <Banner icon="storefront-outline" text="Sonraki adımda işletmenizin adını, kategorisini ve şehrini girip sayfanızı oluşturacaksınız." />
      )}
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Button title={role === 'business' ? 'İşletme hesabı aç' : 'Hesap aç'} size="lg" onPress={submit} loading={busy} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <Text tone="muted">Zaten hesabınız var mı?</Text>
        <Button title="Giriş yapın" variant="ghost" size="sm" onPress={() => router.replace('/giris')} />
      </View>
    </AuthShell>
  );
}

const s = StyleSheet.create({
  role: {
    flex: 1,
    gap: 4,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  roleOn: { borderColor: colors.brandRing, backgroundColor: colors.brandSoft },
});
