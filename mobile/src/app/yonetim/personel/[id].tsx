import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { TimePill, TimeSheet } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Field, Loading, SectionTitle, styles, SwitchRow, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { WEEKDAYS } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service, Staff, StaffHour, WorkingHour } from '@/lib/types';

type Day = Pick<StaffHour, 'weekday' | 'is_open' | 'open_time' | 'close_time'>;
// hours boşsa personel işletme saatlerinde çalışır.
const EMPTY = { name: '', title: '', is_active: true, service_ids: [] as string[], hours: [] as Day[] };
const day = ({ weekday, is_open, open_time, close_time }: Day): Day => ({ weekday, is_open, open_time, close_time });

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
  const [businessHours, setBusinessHours] = useState<WorkingHour[]>([]);
  const [editingTime, setEditingTime] = useState<{ weekday: number; field: 'open_time' | 'close_time' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: sv }, { data: wh }] = await Promise.all([
        supabase.from('services').select('*').eq('business_id', business.id).order('sort_order').order('created_at'),
        supabase.from('working_hours').select('*').eq('business_id', business.id).order('weekday'),
      ]);
      setServices((sv ?? []) as Service[]);
      setBusinessHours((wh ?? []) as WorkingHour[]);
      if (isNew) return setValues(EMPTY);
      const [{ data: member }, { data: links }, { data: own }] = await Promise.all([
        supabase.from('staff').select('*').eq('id', id).maybeSingle(),
        supabase.from('staff_services').select('service_id').eq('staff_id', id),
        supabase.from('staff_hours').select('*').eq('staff_id', id).order('weekday'),
      ]);
      const x = member as Staff | null;
      if (!x) return router.back();
      setValues({
        name: x.name,
        title: x.title,
        is_active: x.is_active,
        service_ids: (links ?? []).map((l: { service_id: string }) => l.service_id),
        hours: ((own ?? []) as StaffHour[]).map(day),
      });
    })();
  }, [business.id, id, isNew]);

  if (!values) return <Loading full />;
  const v = values;
  const set = (patch: Partial<typeof EMPTY>) => setValues({ ...v, ...patch });
  const setDay = (weekday: number, patch: Partial<Day>) => set({ hours: v.hours.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)) });
  const current = editingTime && v.hours.find((h) => h.weekday === editingTime.weekday);

  async function save() {
    if (!v.name.trim()) return setError('Adını yazın.');
    const invalid = v.hours.find((h) => h.is_open && h.close_time.slice(0, 5) <= h.open_time.slice(0, 5));
    if (invalid) return setError(`${WEEKDAYS[invalid.weekday - 1]}: bitiş saati başlangıçtan sonra olmalı.`);
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
    await supabase.from('staff_hours').delete().eq('staff_id', staffId);
    if (v.hours.length) {
      const { error: hoursError } = await supabase.from('staff_hours').insert(v.hours.map((h) => ({ ...h, staff_id: staffId })));
      if (hoursError) {
        setBusy(false);
        return setError(errorMessage(hoursError));
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

        <SectionTitle title="Çalışma saatleri" />
        <Card style={{ padding: 0 }}>
          <SwitchRow
            title="Kendi saatleri var"
            description="Kapalıysa işletmenin çalışma saatlerinde randevu alır."
            value={v.hours.length > 0}
            onValueChange={(on) => set({ hours: on ? businessHours.map(day) : [] })}
          />
          {v.hours.map((h) => {
            const name = WEEKDAYS[h.weekday - 1];
            const shopOpen = businessHours.find((b) => b.weekday === h.weekday)?.is_open;
            const open = !!shopOpen && h.is_open;
            return (
              <View key={h.weekday} style={s.day}>
                <Text variant="bodyStrong" tone={open ? 'default' : 'muted'} style={{ width: 88 }}>
                  {name}
                </Text>
                {open ? (
                  <View style={[styles.rowCenter, { flex: 1, gap: 6 }]}>
                    <TimePill value={h.open_time.slice(0, 5)} label={`${name} başlangıç`} onPress={() => setEditingTime({ weekday: h.weekday, field: 'open_time' })} />
                    <Text tone="muted">–</Text>
                    <TimePill value={h.close_time.slice(0, 5)} label={`${name} bitiş`} onPress={() => setEditingTime({ weekday: h.weekday, field: 'close_time' })} />
                  </View>
                ) : (
                  <Text tone="muted" style={{ flex: 1 }}>
                    {shopOpen ? 'Çalışmıyor' : 'İşletme kapalı'}
                  </Text>
                )}
                <Switch
                  value={open}
                  disabled={!shopOpen}
                  onValueChange={(is_open) => {
                    haptic.select();
                    setDay(h.weekday, { is_open });
                  }}
                  accessibilityLabel={`${name} çalışıyor`}
                  trackColor={{ false: colors.surface3, true: colors.brand700 }}
                  thumbColor={open ? colors.brand300 : colors.ink3}
                  ios_backgroundColor={colors.surface3}
                />
              </View>
            );
          })}
        </Card>

        <Card style={{ padding: 0, marginTop: 4 }}>
          <SwitchRow title="Randevu alabilir" description="Kapalıysa bu kişiye online randevu verilmez." value={v.is_active} onValueChange={(is_active) => set({ is_active })} />
        </Card>

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title="Kaydet" size="lg" onPress={save} loading={busy} />
        {!isNew && <Button title="Personeli sil" icon="trash-outline" variant="dangerGhost" onPress={remove} />}
      </ScrollView>

      <TimeSheet
        visible={!!current}
        onClose={() => setEditingTime(null)}
        title={current && editingTime ? `${WEEKDAYS[current.weekday - 1]} · ${editingTime.field === 'open_time' ? 'başlangıç' : 'bitiş'}` : ''}
        value={current && editingTime ? current[editingTime.field].slice(0, 5) : null}
        onSelect={(t) => editingTime && setDay(editingTime.weekday, editingTime.field === 'open_time' ? { open_time: t } : { close_time: t })}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 60,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
});
