import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { CalendarSheet, SelectField, TimeSheet } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Field, SectionTitle, styles, SwitchRow } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, errorMessage, formatDate, toIso, todayStr } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Business, Staff } from '@/lib/types';

const REASONS = ['Öğle arası', 'Tatil', 'Bayram', 'İzin', 'Rahatsızlık'];

export default function TimeOffScreen() {
  const { business } = useAuth();
  return business ? <TimeOffForm business={business} /> : null;
}

type Picker = 'startDay' | 'endDay' | 'startTime' | 'endTime';

function TimeOffForm({ business }: { business: Business }) {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [who, setWho] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState({ day: todayStr(), time: '12:00' });
  const [end, setEnd] = useState({ day: todayStr(), time: '13:00' });
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('staff')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, [business.id]);

  async function save() {
    // Tüm gün: başlangıç gününün 00:00'ından bitiş gününün ertesi 00:00'ına kadar.
    const starts = toIso(start.day, allDay ? '00:00' : start.time);
    const ends = allDay ? toIso(addDays(end.day, 1), '00:00') : toIso(end.day, end.time);
    if (ends <= starts) return setError('Bitiş, başlangıçtan sonra olmalı.');
    setBusy(true);
    setError('');
    const { error } = await supabase.from('time_off').insert({
      business_id: business.id,
      staff_id: who || null,
      starts_at: starts,
      ends_at: ends,
      reason: reason.trim(),
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    toast('İzin eklendi; bu aralıkta randevu alınmaz.');
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle title="Kim için?" />
        <View style={styles.wrap}>
          <Chip label="Tüm işletme" icon="storefront-outline" selected={who === ''} onPress={() => setWho('')} />
          {staff.map((p) => (
            <Chip key={p.id} label={p.name} selected={who === p.id} onPress={() => setWho(p.id)} />
          ))}
        </View>

        <Card style={{ padding: 0, marginTop: 8 }}>
          <SwitchRow title="Tüm gün" description="Kapalıysa saat aralığı seçersiniz (örn. öğle arası)." value={allDay} onValueChange={setAllDay} />
        </Card>

        <SectionTitle title="Başlangıç" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SelectField icon="calendar-outline" value={formatDate(start.day)} onPress={() => setPicker('startDay')} style={{ flex: 1 }} />
          {!allDay && <SelectField icon="time-outline" value={start.time} onPress={() => setPicker('startTime')} style={{ width: 120 }} />}
        </View>
        <SectionTitle title="Bitiş" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SelectField icon="calendar-outline" value={formatDate(end.day)} onPress={() => setPicker('endDay')} style={{ flex: 1 }} />
          {!allDay && <SelectField icon="time-outline" value={end.time} onPress={() => setPicker('endTime')} style={{ width: 120 }} />}
        </View>

        <SectionTitle title="Açıklama (isteğe bağlı)" />
        <View style={styles.wrap}>
          {REASONS.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(reason === r ? '' : r)} />
          ))}
        </View>
        <Field placeholder="Örn. Bayram tatili" value={reason} onChangeText={setReason} maxLength={100} />

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title="İzni kaydet" size="lg" onPress={save} loading={busy} />
      </ScrollView>

      <CalendarSheet
        key={`s${start.day}`}
        visible={picker === 'startDay'}
        onClose={() => setPicker(null)}
        title="Başlangıç günü"
        value={start.day}
        min={todayStr()}
        onSelect={(day) => {
          setStart({ ...start, day });
          if (end.day < day) setEnd({ ...end, day });
        }}
      />
      <CalendarSheet key={`e${end.day}`} visible={picker === 'endDay'} onClose={() => setPicker(null)} title="Bitiş günü" value={end.day} min={start.day} onSelect={(day) => setEnd({ ...end, day })} />
      <TimeSheet visible={picker === 'startTime'} onClose={() => setPicker(null)} title="Başlangıç saati" value={start.time} onSelect={(time) => setStart({ ...start, time })} step={15} />
      <TimeSheet visible={picker === 'endTime'} onClose={() => setPicker(null)} title="Bitiş saati" value={end.time} onSelect={(time) => setEnd({ ...end, time })} step={15} />
    </KeyboardAvoidingView>
  );
}
