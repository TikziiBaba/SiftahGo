import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Field, Loading, SectionTitle, styles, SwitchRow, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Business, Service, Staff } from '@/lib/types';

const EMPTY = { name: '', title: '', is_active: true, service_ids: [] as string[] };

export default function StaffMemberScreen() {
  const { business } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return business ? <StaffForm business={business} id={id} /> : null;
}

function StaffForm({ business, id }: { business: Business; id: string }) {
  const toast = useToast();
  const isNew = id === 'yeni';
  const [values, setValues] = useState<typeof EMPTY | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: sv } = await supabase.from('services').select('*').eq('business_id', business.id).order('sort_order').order('created_at');
      setServices((sv ?? []) as Service[]);
      if (isNew) return setValues(EMPTY);
      const [{ data: member }, { data: links }] = await Promise.all([
        supabase.from('staff').select('*').eq('id', id).maybeSingle(),
        supabase.from('staff_services').select('service_id').eq('staff_id', id),
      ]);
      const x = member as Staff | null;
      if (!x) return router.back();
      setValues({ name: x.name, title: x.title, is_active: x.is_active, service_ids: (links ?? []).map((l: { service_id: string }) => l.service_id) });
    })();
  }, [business.id, id, isNew]);

  if (!values) return <Loading full />;
  const v = values;
  const set = (patch: Partial<typeof EMPTY>) => setValues({ ...v, ...patch });

  async function save() {
    if (!v.name.trim()) return setError('Adını yazın.');
    setBusy(true);
    setError('');
    const row = { name: v.name.trim(), title: v.title.trim(), is_active: v.is_active };
    let result;
    if (isNew) {
      const { count } = await supabase.from('staff').select('id', { count: 'exact', head: true }).eq('business_id', business.id);
      result = await supabase.from('staff').insert({ ...row, business_id: business.id, sort_order: count ?? 0 }).select('id').single();
    } else {
      result = await supabase.from('staff').update(row).eq('id', id).select('id').single();
    }
    if (result.error) {
      setBusy(false);
      return setError(errorMessage(result.error));
    }
    // Hizmet seçimi: hiçbiri seçilmezse personel tüm hizmetleri verir.
    const staffId = result.data.id as string;
    await supabase.from('staff_services').delete().eq('staff_id', staffId);
    if (v.service_ids.length) {
      const { error: linkError } = await supabase.from('staff_services').insert(v.service_ids.map((service_id) => ({ staff_id: staffId, service_id })));
      if (linkError) {
        setBusy(false);
        return setError(errorMessage(linkError));
      }
    }
    setBusy(false);
    toast(isNew ? 'Personel eklendi.' : 'Personel kaydedildi.');
    router.back();
  }

  function remove() {
    Alert.alert(`"${v.name}" silinsin mi?`, 'Bu kişiye ait gelecekteki randevular personelsiz kalır. Sadece randevu almasını durdurmak için "Randevu alabilir"i kapatın.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('staff').delete().eq('id', id);
          if (error) return setError(errorMessage(error));
          toast('Personel silindi.');
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <Stack.Screen options={{ title: isNew ? 'Yeni personel' : 'Personeli düzenle' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Ad Soyad" icon="person-outline" value={v.name} onChangeText={(name) => set({ name })} autoFocus={isNew} autoCapitalize="words" />
        <Field label="Unvan (isteğe bağlı)" icon="ribbon-outline" placeholder="Örn. Usta, Kalfa, Uzman" value={v.title} onChangeText={(title) => set({ title })} />

        {services.length > 0 && (
          <>
            <SectionTitle title="Verdiği hizmetler" />
            <Text variant="caption" tone="muted">
              Hiçbirini seçmezseniz tüm hizmetleri verebilir.
            </Text>
            <View style={styles.wrap}>
              {services.map((sv) => {
                const on = v.service_ids.includes(sv.id);
                return (
                  <Chip
                    key={sv.id}
                    label={sv.name}
                    icon={on ? 'checkmark' : undefined}
                    selected={on}
                    onPress={() => set({ service_ids: on ? v.service_ids.filter((x) => x !== sv.id) : [...v.service_ids, sv.id] })}
                  />
                );
              })}
            </View>
          </>
        )}

        <Card style={{ padding: 0, marginTop: 4 }}>
          <SwitchRow title="Randevu alabilir" description="Kapalıysa bu kişiye online randevu verilmez." value={v.is_active} onValueChange={(is_active) => set({ is_active })} />
        </Card>

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title="Kaydet" size="lg" onPress={save} loading={busy} />
        {!isNew && <Button title="Personeli sil" icon="trash-outline" variant="dangerGhost" onPress={remove} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
