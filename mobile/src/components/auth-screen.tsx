import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell, GoogleButton, PasswordField, useKeyboardOpen } from '@/components/auth-shell';
import { Reveal } from '@/components/motion';
import { useCaptcha } from '@/components/turnstile';
import { Banner, Button, Field, Segmented, Text } from '@/components/ui';
import { WEB_URL, type IconName } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

type Mode = 'login' | 'signup';
type Role = 'customer' | 'business';

// Kayıt başlığı seçilen hesaba göre değişir (web: components/auth-pitch.tsx).
const HERO = {
  login: { title: 'Tekrar', accent: 'hoş geldiniz.', subtitle: 'Randevularınıza ve işletmenize ulaşmak için giriş yapın.' },
  customer: { title: 'Sıra beklemeden,', accent: 'saatini seç.', subtitle: 'Ücretsiz randevu · Aramak, beklemek yok · Ertele ya da iptal et' },
  business: { title: 'Randevular düzende,', accent: 'siftah sabahtan.', subtitle: '7 gün ücretsiz · 1 dakikada kurulum · Taahhüt yok' },
};

const ROLES: { value: Role; title: string; icon: IconName }[] = [
  { value: 'customer', title: 'Randevu alacağım', icon: 'person-outline' },
  { value: 'business', title: 'İşletmem var', icon: 'storefront-outline' },
];

/**
 * Giriş ve kayıt tek ekranda: üstteki anahtarla aralarında geçilir, ekran kaydırılmaz. Kayıt iki adımlı
 * (kim olduğunuz, sonra hesap bilgileri) ki klavye açıkken de sığsın. Oturum açılınca bu ekran kendiliğinden kapanır.
 */
export function AuthScreen({ initial, business }: { initial: Mode; business?: boolean }) {
  const keyboard = useKeyboardOpen();
  const [mode, setMode] = useState<Mode>(initial);
  const [role, setRole] = useState<Role>(business ? 'business' : 'customer');
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const captcha = useCaptcha();
  const set = (k: keyof typeof form) => (v: string) => {
    setForm({ ...form, [k]: v });
    setError('');
  };

  function switchMode(next: Mode) {
    setMode(next);
    setStep(1);
    setError('');
    setSentTo('');
  }

  async function login() {
    if (!form.email.trim() || !form.password) return setError('E-posta ve şifrenizi yazın.');
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password, options: { captchaToken: captcha.token } });
    setBusy(false);
    if (error) {
      haptic.error();
      captcha.retry();
      setError(errorMessage(error));
    }
  }

  function next() {
    if (form.full_name.trim().length < 2) {
      haptic.error();
      return setError('Adınızı ve soyadınızı yazın.');
    }
    setError('');
    setStep(2);
  }

  async function signup() {
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
        captchaToken: captcha.token,
      },
    });
    setBusy(false);
    if (error) {
      haptic.error();
      captcha.retry();
      return setError(errorMessage(error));
    }
    // Oturum açıldıysa ekran kendiliğinden kapanır (işletme hesabı kuruluma gider).
    if (!data.session) setSentTo(form.email.trim());
  }

  const hero = mode === 'login' ? HERO.login : HERO[role];
  const errorBanner = error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null;

  if (sentTo) {
    return (
      <AuthShell title="E-postanızı" accent="kontrol edin." subtitle={`${sentTo} adresine doğrulama bağlantısı gönderdik. Doğruladıktan sonra buradan giriş yapabilirsiniz.`} heroKey="sent">
        <Button title="Giriş yap" size="lg" onPress={() => switchMode('login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell {...hero} heroKey={mode === 'login' ? 'login' : role}>
      {!keyboard && (
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'login', label: 'Giriş yap' },
            { value: 'signup', label: 'Kayıt ol' },
          ]}
        />
      )}

      {mode === 'login' ? (
        <Reveal key="login" offset={10} style={s.group}>
          {!keyboard && <GoogleButton />}
          <Field
            placeholder="E-posta"
            icon="mail-outline"
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <PasswordField
            placeholder="Şifre"
            value={form.password}
            onChangeText={set('password')}
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={login}
            returnKeyType="go"
          />
          <Pressable onPress={() => router.push('/sifremi-unuttum')} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-end' }}>
            <Text variant="label" tone="brand">
              Şifremi unuttum
            </Text>
          </Pressable>
          {captcha.widget}
          {errorBanner}
          <Button title="Giriş yap" size="lg" onPress={login} loading={busy} disabled={!captcha.ready} />
        </Reveal>
      ) : step === 1 ? (
        <Reveal key="signup-1" offset={10} style={s.group}>
          <View style={s.roles} accessibilityRole="radiogroup">
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
                  <Ionicons name={r.icon} size={18} color={on ? colors.brand300 : colors.ink3} />
                  <Text variant="label" tone={on ? 'default' : 'secondary'} numberOfLines={1}>
                    {r.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!keyboard && <GoogleButton business={role === 'business'} />}
          <Field placeholder="Ad Soyad" icon="person-outline" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" textContentType="name" returnKeyType="next" />
          <Field
            placeholder="Telefon (isteğe bağlı)"
            icon="call-outline"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          {errorBanner}
          <Button title="Devam" size="lg" onPress={next} />
        </Reveal>
      ) : (
        <Reveal key="signup-2" offset={10} style={s.group}>
          <Pressable onPress={() => setStep(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Önceki adım" style={s.stepBack}>
            <Ionicons name="chevron-back" size={16} color={colors.ink2} />
            <Text variant="label" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {form.full_name.trim()} · {role === 'business' ? 'İşletme hesabı' : 'Müşteri hesabı'}
            </Text>
          </Pressable>
          <Field
            placeholder="E-posta"
            icon="mail-outline"
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <PasswordField
            placeholder="Şifre (en az 6 karakter)"
            value={form.password}
            onChangeText={set('password')}
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={signup}
            returnKeyType="go"
          />
          {role === 'business' && !keyboard ? (
            <Text variant="caption" tone="muted">
              Sonraki adımda işletmenizin adını, kategorisini ve şehrini girip sayfanızı oluşturacaksınız.
            </Text>
          ) : null}
          {captcha.widget}
          {errorBanner}
          <Button title={role === 'business' ? 'İşletme hesabı aç' : 'Hesap aç'} size="lg" onPress={signup} loading={busy} disabled={!captcha.ready} />
        </Reveal>
      )}
    </AuthShell>
  );
}

const s = StyleSheet.create({
  group: { gap: 12 },
  roles: { flexDirection: 'row', gap: 10 },
  role: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  roleOn: { borderColor: colors.brandRing, backgroundColor: colors.brandSoft },
  stepBack: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28 },
});
