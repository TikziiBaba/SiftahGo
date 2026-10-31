import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { CalendarSheet, SelectField } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Field, SectionTitle, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, errorMessage, formatDate, todayStr } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Business, FreezeRequest } from '@/lib/types';

export default function FreezeScreen() {
  const { business } = useAuth();
  return business ? <FreezeForm business={business} /> : null;
}

const STATUS_TITLE = { pending: 'Talebiniz inceleniyor', approved: 'Talebiniz uygulandı', rejected: 'Talebiniz reddedildi' };

/** İşletme sahibi askıya alamaz; dondurma talebi açar, yönetici uygular ya da gerekçeyle reddeder. */
function FreezeForm({ business }: { business: Business }) {
  const toast = useToast();
  const [last, setLast] = useState<FreezeRequest | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [startsOn, setStartsOn] = useState(todayStr());
  const [endsOn, setEndsOn] = useState(addDays(todayStr(), 7));
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('freeze_requests')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLast((data as FreezeRequest | null) ?? null);
  }, [business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- son talebi ilk açılışta yükle
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('request_freeze', { p_reason: reason, p_starts_on: startsOn, p_ends_on: endsOn });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setReason('');
    toast('Talebiniz gönderildi.');
    await load();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">
          Bir süre hizmet veremeyecekseniz talep açın. Ekibimiz uygulayınca sayfanız görünmez, randevu alınmaz ve dondurulan süre aboneliğinize eklenir.
        </Text>

        {last === undefined ? <Skeleton height={64} /> : null}
        {last ? (
          <Card style={{ gap: 4 }}>
            <Text variant="bodyStrong">{STATUS_TITLE[last.status]}</Text>
            <Text variant="caption" tone="muted">
              {formatDate(last.starts_on, false)} – {formatDate(last.ends_on, false)}
            </Text>
            {last.admin_note ? <Text>{last.admin_note}</Text> : null}
          </Card>
        ) : null}

        {last !== undefined && last?.status !== 'pending' && !business.is_suspended ? (
          <>
            <SectionTitle title="Tarih aralığı" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SelectField icon="calendar-outline" value={formatDate(startsOn, false)} onPress={() => setPicker('start')} style={{ flex: 1 }} />
              <SelectField icon="calendar-outline" value={formatDate(endsOn, false)} onPress={() => setPicker('end')} style={{ flex: 1 }} />
            </View>
            <SectionTitle title="Sebep" />
            <Field placeholder="Örn. Dükkânda tadilat var." value={reason} onChangeText={setReason} maxLength={500} multiline />
            {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
            <Button title="Talep gönder" size="lg" onPress={send} loading={busy} disabled={reason.trim().length < 3} />
          </>
        ) : null}
      </ScrollView>

      <CalendarSheet
        key={`s${startsOn}`}
        visible={picker === 'start'}
        onClose={() => setPicker(null)}
        title="Başlangıç günü"
        value={startsOn}
        min={todayStr()}
        onSelect={(day) => {
          setStartsOn(day);
          if (endsOn < day) setEndsOn(day);
        }}
      />
      <CalendarSheet key={`e${endsOn}`} visible={picker === 'end'} onClose={() => setPicker(null)} title="Bitiş günü" value={endsOn} min={startsOn} onSelect={setEndsOn} />
    </KeyboardAvoidingView>
  );
}
