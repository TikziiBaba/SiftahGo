import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { KeyboardScreen } from '@/components/keyboard-screen';
import { useToast } from '@/components/toast';
import { Button, Card, Chip, Field, SectionTitle, styles, SwitchRow, Text } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { WEB_URL } from '@/lib/constants';
import { errorMessage, MONTHS } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function ProfileScreen() {
  const { session, profile, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    birth_day: profile?.birth_day ? String(profile.birth_day) : '',
    birth_month: profile?.birth_month ?? null,
    rebook_reminders: profile?.rebook_reminders ?? true,
  });
  const [password, setPassword] = useState({ next: '', again: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [errors, setErrors] = useState<{ profile?: string; password?: string; delete?: string }>({});
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function saveProfile() {
    if (!session) return;
    if (form.full_name.trim().length < 2) return setErrors({ profile: 'Adınızı ve soyadınızı yazın.' });
    const day = form.birth_day ? Number(form.birth_day) : null;
    if (!day !== !form.birth_month) return setErrors({ profile: 'Doğum gününüz için gün ve ayı birlikte girin.' });
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return setErrors({ profile: 'Gün 1 ile 31 arasında olmalı.' });
    setBusy('profile');
    setErrors({});
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        birth_day: day,
        birth_month: form.birth_month,
        rebook_reminders: form.rebook_reminders,
      })
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

  // Silme sitede yapılır (yönetici anahtarı gerekir); uygulama oturumu erişim anahtarıyla gider.
  async function deleteAccount() {
    setDeleting(true);
    setErrors({});
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`${WEB_URL}/api/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) {
      setDeleting(false);
      return setErrors({ delete: body?.error ?? 'Hesap silinemedi. İnternet bağlantınızı kontrol edin.' });
    }
    toast('Hesabınız silindi.');
    await signOut();
  }

  return (
    <KeyboardScreen>
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
          <Field
            label="Doğum günü (isteğe bağlı)"
            icon="gift-outline"
            value={form.birth_day}
            onChangeText={(birth_day) => setForm({ ...form, birth_day: birth_day.replace(/\D/g, '') })}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="Gün"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MONTHS.map((m, i) => (
              <Chip key={m} label={m} selected={form.birth_month === i + 1} onPress={() => setForm({ ...form, birth_month: form.birth_month === i + 1 ? null : i + 1 })} />
            ))}
          </ScrollView>
          <Text variant="caption" tone="muted">
            Gittiğiniz işletmeler doğum gününüzde size indirim kuponu hediye edebilir. Yılı sormuyoruz; işletmeler tarihi görmez.
          </Text>
          <View style={{ marginHorizontal: -14 }}>
            <SwitchRow
              title="“Zamanı geldi” hatırlatmaları"
              description="Son randevunuzun üzerinden bir süre geçince işletme size “Yine randevu alalım mı?” der."
              value={form.rebook_reminders}
              onValueChange={(rebook_reminders) => setForm({ ...form, rebook_reminders })}
            />
          </View>
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

        <SectionTitle title="Hesabımı sil" />
        {profile?.role === 'business' ? (
          <Card style={{ gap: 12 }}>
            <Text tone="muted">İşletme hesabı uygulamadan silinmez; abonelik ve randevular için ekibimiz kapatır. Destek talebi açın.</Text>
            <Button title="Destek talebi aç" icon="help-buoy-outline" variant="secondary" onPress={() => router.push('/destek')} />
          </Card>
        ) : (
          <Card style={{ gap: 12, borderColor: colors.dangerLine }}>
            <Text tone="muted">Yaklaşan randevularınız iptal edilir, favorileriniz ve bildirimleriniz silinir, yorumlarınızdaki adınız kaldırılır. Bu işlem geri alınamaz.</Text>
            <Field label="Onaylamak için SİL yazın" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
            {errors.delete ? (
              <Text variant="label" tone="danger">
                {errors.delete}
              </Text>
            ) : null}
            <Button
              title="Hesabımı kalıcı olarak sil"
              variant="danger"
              onPress={deleteAccount}
              loading={deleting}
              disabled={confirmText.trim().toLocaleUpperCase('tr') !== 'SİL'}
            />
          </Card>
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}
