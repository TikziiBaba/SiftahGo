import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { SaveBar } from '@/components/save-bar';
import { Card, Chip, SectionTitle, styles, SwitchRow, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CONFIRM_MODES, confirmMode } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business } from '@/lib/types';

// Web ile aynı seçenekler (web/src/app/panel/ayarlar/page.tsx)
const SLOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const NOTICE_OPTIONS = [
  [0, 'Hemen'],
  [30, '30 dk önce'],
  [60, '1 saat önce'],
  [120, '2 saat önce'],
  [240, '4 saat önce'],
  [720, '12 saat önce'],
  [1440, '1 gün önce'],
] as const;
const BOOKING_DAYS = [7, 14, 30, 60, 90, 180, 365];

export default function RulesScreen() {
  const { business } = useAuth();
  return business ? <Rules business={business} /> : null;
}

/** Müşterinin hangi saatlere, ne kadar önceden randevu alabileceği ve randevunun nasıl onaylanacağı. */
function Rules({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const [form, setForm] = useState({
    slot_minutes: business.slot_minutes,
    booking_days: business.booking_days,
    min_notice_minutes: business.min_notice_minutes,
    auto_confirm: business.auto_confirm,
    auto_confirm_known_only: business.auto_confirm_known_only,
    is_published: business.is_published,
  });
  const [error, setError] = useState('');
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== business[k]);
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setError('');
  };
  const bookingDays = BOOKING_DAYS.includes(form.booking_days) ? BOOKING_DAYS : [...BOOKING_DAYS, form.booking_days].sort((a, b) => a - b);

  async function save() {
    const { error } = await supabase.from('businesses').update(form).eq('id', business.id);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    await refresh();
    return true;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Saatler" />
        <Text variant="label" tone="secondary">
          Saat aralığı
        </Text>
        <View style={styles.wrap}>
          {SLOT_OPTIONS.map((m) => (
            <Chip key={m} label={`${m} dk`} selected={form.slot_minutes === m} onPress={() => set({ slot_minutes: m })} />
          ))}
        </View>
        <Text variant="label" tone="secondary" style={{ marginTop: 4 }}>
          En erken randevu
        </Text>
        <View style={styles.wrap}>
          {NOTICE_OPTIONS.map(([m, label]) => (
            <Chip key={m} label={label} selected={form.min_notice_minutes === m} onPress={() => set({ min_notice_minutes: m })} />
          ))}
        </View>
        <Text variant="label" tone="secondary" style={{ marginTop: 4 }}>
          En geç kaç gün sonrası
        </Text>
        <View style={styles.wrap}>
          {bookingDays.map((d) => (
            <Chip key={d} label={`${d} gün`} selected={form.booking_days === d} onPress={() => set({ booking_days: d })} />
          ))}
        </View>

        <SectionTitle title="Randevu onayı" />
        <Card style={{ padding: 0 }}>
          {CONFIRM_MODES.map((m, i) => {
            const on = confirmMode(form).id === m.id;
            return (
              <View key={m.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.line }} />}
                <Pressable
                  onPress={() => {
                    haptic.select();
                    set({ auto_confirm: m.auto_confirm, auto_confirm_known_only: m.auto_confirm_known_only });
                  }}
                  accessibilityRole="radio"
                  aria-checked={on}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 58 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{m.label}</Text>
                    <Text variant="caption" tone="muted">
                      {m.hint}
                    </Text>
                  </View>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.brand300 : colors.ink3} />
                </Pressable>
              </View>
            );
          })}
        </Card>
        <Text variant="caption" tone="muted">
          Sık iptal eden veya randevusuna gelmeyen müşterilerin randevusu her durumda onayınıza düşer. Reddederken yazdığınız sebep müşteriye
          iletilir.
        </Text>

        <Card style={{ padding: 0, marginTop: 8 }}>
          <SwitchRow
            title="Sayfam yayında"
            description="Kapalıysa işletmeniz aramada görünmez ve randevu alınamaz."
            value={form.is_published}
            onValueChange={(is_published) => set({ is_published })}
          />
        </Card>
      </ScrollView>

      <SaveBar dirty={dirty} error={error} onSave={save} />
    </View>
  );
}
