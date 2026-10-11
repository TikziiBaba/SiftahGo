import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Field, Loading, SectionTitle, styles, SwitchRow } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, formatDuration } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Business, Service } from '@/lib/types';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const EMPTY = { name: '', description: '', duration: '30', price: '', is_active: true };

export default function ServiceScreen() {
  const { business } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return business ? <ServiceForm business={business} id={id} /> : null;
}

function ServiceForm({ business, id }: { business: Business; id: string }) {
  const toast = useToast();
  const isNew = id === 'yeni';
  const [values, setValues] = useState<typeof EMPTY | null>(isNew ? EMPTY : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const x = data as Service | null;
        if (!x) return router.back();
        setValues({ name: x.name, description: x.description, duration: String(x.duration_minutes), price: String(Number(x.price)), is_active: x.is_active });
      });
  }, [id, isNew]);

  if (!values) return <Loading full />;
  const v = values;
  const set = (patch: Partial<typeof EMPTY>) => setValues({ ...v, ...patch });

  async function save() {
    const duration = Number(v.duration);
    const price = Number(v.price.replace(',', '.') || 0);
    if (!v.name.trim()) return setError('Hizmet adını yazın.');
    if (!Number.isInteger(duration) || duration < 5 || duration > 600) return setError('Süre 5 ile 600 dakika arasında olmalı.');
    if (!Number.isFinite(price) || price < 0) return setError('Geçerli bir fiyat yazın.');
    setBusy(true);
    setError('');
    const row = { name: v.name.trim(), description: v.description.trim(), duration_minutes: duration, price, is_active: v.is_active };
    let result;
    if (isNew) {
      const { count } = await supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', business.id);
      result = await supabase.from('services').insert({ ...row, business_id: business.id, sort_order: count ?? 0 });
    } else {
      result = await supabase.from('services').update(row).eq('id', id);
    }
    setBusy(false);
    if (result.error) return setError(errorMessage(result.error));
    toast(isNew ? 'Hizmet eklendi.' : 'Hizmet kaydedildi.');
    router.back();
  }

  function remove() {
    Alert.alert(`"${v.name}" silinsin mi?`, 'Geçmiş randevular silinmez. Sadece gizlemek için "Online randevuda göster"i kapatabilirsiniz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('services').delete().eq('id', id);
          if (error) return setError(errorMessage(error));
          toast('Hizmet silindi.');
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <Stack.Screen options={{ title: isNew ? 'Yeni hizmet' : 'Hizmeti düzenle' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Hizmet adı" placeholder="Örn. Saç Kesimi" value={v.name} onChangeText={(name) => set({ name })} autoFocus={isNew} autoCapitalize="sentences" />

        <SectionTitle title={`Süre · ${Number(v.duration) ? formatDuration(Number(v.duration)) : '—'}`} />
        <View style={styles.wrap}>
          {DURATIONS.map((m) => (
            <Chip key={m} label={formatDuration(m)} solid selected={Number(v.duration) === m} onPress={() => set({ duration: String(m) })} />
          ))}
        </View>
        <Field label="Veya dakika olarak" icon="time-outline" value={v.duration} onChangeText={(duration) => set({ duration: duration.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={3} />

        <Field label="Fiyat (₺)" icon="pricetag-outline" placeholder="0" value={v.price} onChangeText={(price) => set({ price: price.replace(/[^\d.,]/g, '') })} keyboardType="decimal-pad" hint="Ücretsiz hizmetler için boş bırakın." />
        <Field label="Açıklama (isteğe bağlı)" placeholder="Örn. Yıkama ve fön dahil" value={v.description} onChangeText={(description) => set({ description })} multiline maxLength={300} />

        <Card style={{ padding: 0 }}>
          <SwitchRow title="Online randevuda göster" description="Kapalıysa müşteriler bu hizmeti göremez." value={v.is_active} onValueChange={(is_active) => set({ is_active })} />
        </Card>

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title="Kaydet" size="lg" onPress={save} loading={busy} />
        {!isNew && <Button title="Hizmeti sil" icon="trash-outline" variant="dangerGhost" onPress={remove} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
