import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimeSheet } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Empty, IconButton, SectionTitle, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { WEEKDAYS } from '@/lib/constants';
import { addDays, dayOf, errorMessage, formatDate, formatTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Business, Staff, TimeOff, WorkingHour } from '@/lib/types';

export default function HoursScreen() {
  const { business } = useAuth();
  return business ? <Hours business={business} /> : null;
}

/** "12 Eki 09:00 → 14:00" veya "12 – 14 Ekim · tüm gün" */
function rangeText(t: TimeOff) {
  if (formatTime(t.starts_at) === '00:00' && formatTime(t.ends_at) === '00:00') {
    const first = dayOf(t.starts_at);
    const last = addDays(dayOf(t.ends_at), -1);
    return first === last ? `${formatDate(first)} · tüm gün` : `${formatDate(first, false)} – ${formatDate(last, false)} · tüm gün`;
  }
  const sameDay = dayOf(t.starts_at) === dayOf(t.ends_at);
  return `${formatDate(t.starts_at, false)} ${formatTime(t.starts_at)} → ${sameDay ? '' : `${formatDate(t.ends_at, false)} `}${formatTime(t.ends_at)}`;
}

function Hours({ business }: { business: Business }) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [hours, setHours] = useState<WorkingHour[] | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOff[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ weekday: number; field: 'open_time' | 'close_time' } | null>(null);

  useEffect(() => {
    supabase
      .from('working_hours')
      .select('*')
      .eq('business_id', business.id)
      .order('weekday')
      .then(({ data }) => setHours((data ?? []) as WorkingHour[]));
  }, [business.id]);

  // İzinler, izin ekleme ekranından dönünce tazelenir (kaydedilmemiş saatler bozulmaz).
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        supabase.from('time_off').select('*').eq('business_id', business.id).gte('ends_at', new Date().toISOString()).order('starts_at'),
        supabase.from('staff').select('*').eq('business_id', business.id).order('sort_order'),
      ]).then(([t, s]) => {
        setTimeOff((t.data ?? []) as TimeOff[]);
        setStaff((s.data ?? []) as Staff[]);
      });
    }, [business.id]),
  );

  function update(weekday: number, patch: Partial<WorkingHour>) {
    setHours((list) => list!.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
    setDirty(true);
    setError('');
  }

  function copyMonday() {
    const monday = hours?.find((h) => h.weekday === 1);
    if (!monday) return;
    haptic.select();
    setHours((list) =>
      list!.map((h) => (h.weekday >= 2 && h.weekday <= 5 ? { ...h, is_open: monday.is_open, open_time: monday.open_time, close_time: monday.close_time } : h)),
    );
    setDirty(true);
  }

  async function save() {
    if (!hours) return;
    const invalid = hours.find((h) => h.is_open && h.close_time.slice(0, 5) <= h.open_time.slice(0, 5));
    if (invalid) return setError(`${WEEKDAYS[invalid.weekday - 1]}: kapanış saati açılıştan sonra olmalı.`);
    setBusy(true);
    const { error } = await supabase.from('working_hours').upsert(hours);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setDirty(false);
    toast('Çalışma saatleri kaydedildi.');
  }

  function removeTimeOff(t: TimeOff) {
    Alert.alert('İzin silinsin mi?', rangeText(t), [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('time_off').delete().eq('id', t.id);
          if (error) return toast(errorMessage(error), 'error');
          setTimeOff((list) => list?.filter((x) => x.id !== t.id) ?? null);
          toast('İzin silindi.');
        },
      },
    ]);
  }

  const current = editing && hours?.find((h) => h.weekday === editing.weekday);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, dirty && { paddingBottom: 120 }]}>
        <Text tone="muted">Müşteriler sadece açık olduğunuz saatlerde randevu alabilir.</Text>
        <Card style={{ padding: 0 }}>
          {hours === null ? (
            <Skeleton height={320} />
          ) : (
            hours.map((h, i) => (
              <View key={h.weekday} style={[s.day, i > 0 && s.dayBorder]}>
                <Text variant="bodyStrong" tone={h.is_open ? 'default' : 'muted'} style={{ width: 88 }}>
                  {WEEKDAYS[h.weekday - 1]}
                </Text>
                {h.is_open ? (
                  <View style={[styles.rowCenter, { flex: 1, gap: 6 }]}>
                    <TimePill value={h.open_time.slice(0, 5)} label={`${WEEKDAYS[h.weekday - 1]} açılış`} onPress={() => setEditing({ weekday: h.weekday, field: 'open_time' })} />
                    <Text tone="muted">–</Text>
                    <TimePill value={h.close_time.slice(0, 5)} label={`${WEEKDAYS[h.weekday - 1]} kapanış`} onPress={() => setEditing({ weekday: h.weekday, field: 'close_time' })} />
                  </View>
                ) : (
                  <Text tone="muted" style={{ flex: 1 }}>
                    Kapalı
                  </Text>
                )}
                <Switch
                  value={h.is_open}
                  onValueChange={(is_open) => {
                    haptic.select();
                    update(h.weekday, { is_open });
                  }}
                  accessibilityLabel={`${WEEKDAYS[h.weekday - 1]} açık`}
                  trackColor={{ false: colors.surface3, true: colors.brand700 }}
                  thumbColor={h.is_open ? colors.brand300 : colors.ink3}
                  ios_backgroundColor={colors.surface3}
                />
              </View>
            ))
          )}
        </Card>
        {hours && <Button title="Pazartesi saatlerini hafta içine uygula" icon="copy-outline" variant="ghost" size="sm" onPress={copyMonday} />}
        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

        <SectionTitle title="İzin ve tatiller" action="Ekle" onAction={() => router.push('/yonetim/izin')} />
        <Text variant="caption" tone="muted">
          Bu aralıklarda randevu alınamaz (öğle arası, tatil, izin günü vb.).
        </Text>
        {timeOff === null ? (
          <Skeleton height={64} />
        ) : timeOff.length === 0 ? (
          <Card>
            <Empty icon="airplane-outline" text="Planlanmış izin yok.">
              <Button title="İzin ekle" icon="add" variant="secondary" onPress={() => router.push('/yonetim/izin')} />
            </Empty>
          </Card>
        ) : (
          timeOff.map((t) => (
            <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.offIcon}>
                <Ionicons name="airplane-outline" size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{rangeText(t)}</Text>
                <Text variant="caption" tone="muted">
                  {t.staff_id ? (staff.find((x) => x.id === t.staff_id)?.name ?? 'Personel') : 'Tüm işletme'}
                  {t.reason ? ` · ${t.reason}` : ''}
                </Text>
              </View>
              <IconButton icon="trash-outline" label="İzni sil" color={colors.danger} size={36} onPress={() => removeTimeOff(t)} />
            </Card>
          ))
        )}
      </ScrollView>

      {dirty && (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <Button title="Değişiklikleri kaydet" size="lg" onPress={save} loading={busy} />
        </View>
      )}

      <TimeSheet
        visible={!!current}
        onClose={() => setEditing(null)}
        title={current && editing ? `${WEEKDAYS[current.weekday - 1]} · ${editing.field === 'open_time' ? 'açılış' : 'kapanış'}` : ''}
        value={current && editing ? current[editing.field].slice(0, 5) : null}
        onSelect={(t) => editing && update(editing.weekday, editing.field === 'open_time' ? { open_time: t } : { close_time: t })}
      />
    </View>
  );
}

function TimePill({ value, label, onPress }: { value: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [s.pill, pressed && { borderColor: colors.brandRing }]}>
      <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  day: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, minHeight: 60 },
  dayBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  offIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
