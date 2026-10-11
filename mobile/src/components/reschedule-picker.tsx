import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DayStrip } from '@/components/pickers';
import { Button, Chip, Skeleton, styles, Text } from '@/components/ui';
import { addDays, dayOf, errorMessage, formatDate, formatTime, isoWeekday, todayStr } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import type { Appointment, WorkingHour } from '@/lib/types';

type Props = {
  appointment: Pick<Appointment, 'id' | 'business_id' | 'service_id' | 'staff_id' | 'starts_at'>;
  /** Saat değişti; yeni başlangıç */
  onDone: (startsAt: string) => void;
};

/** Randevunun saatini değiştirir (müşteri veya işletme sahibi). Aynı personelin boş saatleri gösterilir. */
export function ReschedulePicker({ appointment: a, onDone }: Props) {
  const [days, setDays] = useState<{ day: string; disabled: boolean }[] | null>(null);
  const [day, setDay] = useState(() => dayOf(a.starts_at));
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const times = slotResult?.key === `${day}|${reload}` ? slotResult.times : null;

  useEffect(() => {
    Promise.all([
      supabase.from('businesses').select('booking_days').eq('id', a.business_id).maybeSingle(),
      supabase.from('working_hours').select('*').eq('business_id', a.business_id),
    ]).then(([b, h]) => {
      const hours = (h.data ?? []) as WorkingHour[];
      const start = todayStr();
      setDays(
        Array.from({ length: Math.min(b.data?.booking_days ?? 30, 30) + 1 }, (_, i) => {
          const d = addDays(start, i);
          return { day: d, disabled: !(hours.find((x) => x.weekday === isoWeekday(d))?.is_open ?? false) };
        }),
      );
    });
  }, [a.business_id]);

  useEffect(() => {
    let active = true;
    const key = `${day}|${reload}`;
    supabase
      .rpc('get_available_slots', { p_business_id: a.business_id, p_service_id: a.service_id, p_day: day, p_staff_id: a.staff_id, p_ignore: a.id })
      .then(({ data }) => {
        if (!active) return;
        const current = new Date(a.starts_at).getTime();
        const unique = [...new Set(((data ?? []) as { slot_start: string }[]).map((r) => r.slot_start))];
        setSlotResult({ key, times: unique.filter((t) => new Date(t).getTime() !== current) });
      });
    return () => {
      active = false;
    };
  }, [a.id, a.business_id, a.service_id, a.staff_id, a.starts_at, day, reload]);

  async function save() {
    if (!time) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('reschedule_appointment', { p_id: a.id, p_starts_at: time, p_staff_id: a.staff_id });
    setBusy(false);
    if (error) {
      haptic.error();
      setError(errorMessage(error));
      if (error.message.includes('müsait değil')) {
        setTime(null);
        setReload((r) => r + 1);
      }
      return;
    }
    haptic.success();
    onDone(time);
  }

  return (
    <View style={{ gap: 12 }}>
      {days === null ? (
        <Skeleton height={78} />
      ) : (
        <DayStrip
          days={days}
          value={day}
          onChange={(d) => {
            setDay(d);
            setTime(null);
          }}
        />
      )}
      {times === null ? (
        <View style={styles.wrap}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} height={38} style={s.slot} />
          ))}
        </View>
      ) : times.length === 0 ? (
        <Text tone="muted">Bu gün için boş saat yok. Başka bir gün seçin.</Text>
      ) : (
        <View style={styles.wrap}>
          {times.map((t) => (
            <Chip key={t} label={formatTime(t)} solid selected={t === time} onPress={() => setTime(t)} style={s.slot} />
          ))}
        </View>
      )}
      {error ? (
        <Text variant="label" tone="danger">
          {error}
        </Text>
      ) : null}
      <Button
        title={time ? `${formatDate(dayOf(time), false)} ${formatTime(time)} olarak değiştir` : 'Yeni saat seçin'}
        icon="time-outline"
        disabled={!time}
        loading={busy}
        onPress={save}
      />
    </View>
  );
}

const s = StyleSheet.create({
  slot: { flexBasis: '22%', flexGrow: 1, maxWidth: '24%', paddingHorizontal: 0 },
});
