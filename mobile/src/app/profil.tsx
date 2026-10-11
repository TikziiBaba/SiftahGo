import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Field, SectionTitle, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session, profile, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' });
  const [password, setPassword] = useState({ next: '', again: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [errors, setErrors] = useState<{ profile?: string; password?: string }>({});

  async function saveProfile() {
    if (!session) return;
    if (form.full_name.trim().length < 2) return setErrors({ profile: 'Adınızı ve soyadınızı yazın.' });
    setBusy('profile');
    setErrors({});
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null })
      .eq('id', session.user.id);
    setBusy(null);
    if (error) return setErrors({ profile: errorMessage(error) });
    await refresh();
    toast('Profiliniz kaydedildi.');
    router.back();
  }

  async function savePassword() {
    if (password.next.length < 6) return setErrors({ password: 'Şifre en az 6 karakter olmalı.' });
    if (password.next !== password.again) return setErrors({ password: 'Şifreler aynı değil.' });
    setBusy('password');
    setErrors({});
    const { error } = await supabase.auth.updateUser({ password: password.next });
    setBusy(null);
    if (error) return setErrors({ password: errorMessage(error) });
    setPassword({ next: '', again: '' });
    toast('Şifreniz değiştirildi.');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle title="Kişisel bilgiler" />
        <Card style={{ gap: 14 }}>
          <Field label="Ad Soyad" icon="person-outline" value={form.full_name} onChangeText={(full_name) => setForm({ ...form, full_name })} autoComplete="name" />
          <Field
            label="Telefon"
            icon="call-outline"
            value={form.phone}
            onChangeText={(phone) => setForm({ ...form, phone })}
            keyboardType="phone-pad"
            placeholder="05xx xxx xx xx"
            hint="Randevu formunda otomatik doldurulur."
          />
          <Field label="E-posta" icon="mail-outline" value={session?.user.email ?? ''} editable={false} hint="E-posta adresi değiştirilemez." />
          {errors.profile ? (
            <Text variant="label" tone="danger">
              {errors.profile}
            </Text>
          ) : null}
          <Button title="Kaydet" onPress={saveProfile} loading={busy === 'profile'} />
        </Card>

        <SectionTitle title="Şifre değiştir" />
        <Card style={{ gap: 14 }}>
          <Field
            label="Yeni şifre"
            icon="lock-closed-outline"
            value={password.next}
            onChangeText={(next) => setPassword({ ...password, next })}
            secureTextEntry={!show}
            autoComplete="new-password"
            hint="En az 6 karakter"
          />
          <Field
            label="Yeni şifre (tekrar)"
            icon="lock-closed-outline"
            value={password.again}
            onChangeText={(again) => setPassword({ ...password, again })}
            secureTextEntry={!show}
            autoComplete="new-password"
          />
          <Button title={show ? 'Şifreyi gizle' : 'Şifreyi göster'} variant="ghost" size="sm" icon={show ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShow(!show)} />
          {errors.password ? (
            <Text variant="label" tone="danger">
              {errors.password}
            </Text>
          ) : null}
          <Button title="Şifreyi değiştir" variant="secondary" onPress={savePassword} loading={busy === 'password'} disabled={!password.next} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
