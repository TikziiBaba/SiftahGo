import { useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, Text } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';

const LATE_MINUTES = [5, 10, 15];
const DELAY_MINUTES = [10, 15, 30, 45];
const TWO_HOURS = 2 * 60 * 60 * 1000;

/**
 * Rozet metni: müşterinin son haberi (işletme görür) ya da işletmenin son haberi (müşteri görür). Haber yoksa ve
 * randevu bekleyen/onaylı değilse null; iptal, tamamlanan ve gelmeyen randevuda eski haber gösterilmez.
 */
export function delayLabel(
  a: Pick<Appointment, 'customer_late_minutes' | 'business_delay_minutes' | 'status'>,
  side: 'business' | 'customer' = 'business',
): string | null {
  if (a.status !== 'pending' && a.status !== 'confirmed') return null;
  if (side === 'business') return a.customer_late_minutes ? `${a.customer_late_minutes} dk gecikiyor` : null;
  return a.business_delay_minutes ? `Yaklaşık ${a.business_delay_minutes} dk gecikme` : null;
}

function Minutes({ options, busy, onPick }: { options: number[]; busy: boolean; onPick: (m: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((m) => (
        <Button key={m} title={`${m} dk`} variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => onPick(m)} />
      ))}
    </View>
  );
}

/** Müşteri: randevudan 2 saat önce ile bitiş arası "geç kalacağım" der. */
export function CustomerLateButton({ appointment, onDone }: { appointment: Appointment; onDone?: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now] = useState(() => Date.now()); // ekran açıldığı an; sunucu zaten pencereyi denetler
  const inWindow = now >= new Date(appointment.starts_at).getTime() - TWO_HOURS && now < new Date(appointment.ends_at).getTime();
  if (!inWindow || !['pending', 'confirmed'].includes(appointment.status)) return null;

  async function send(minutes: number) {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('report_customer_late', { p_id: appointment.id, p_minutes: minutes });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setOpen(false);
    toast(`İşletmeye ${minutes} dk gecikeceğin haber verildi.`);
    onDone?.();
  }

  return (
    <>
      <Button title="Geç kalacağım" icon="time-outline" variant="secondary" size="sm" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Geç kalacağım" subtitle="Ne kadar geç kalacaksın?">
        <Minutes options={LATE_MINUTES} busy={busy} onPick={send} />
        {error ? (
          <Text variant="label" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title="Vazgeç" variant="ghost" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** İşletme: bir personelin önümüzdeki 3 saatteki müşterilerine "gecikmemiz var" der. */
export function BusinessDelayButton({ staff, onDone }: { staff: { id: string; name: string }; onDone?: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(minutes: number) {
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('report_business_delay', { p_staff_id: staff.id, p_minutes: minutes });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    const n = Number(data ?? 0);
    setOpen(false);
    toast(n > 0 ? `${n} müşteriye haber verildi` : 'Önümüzdeki 3 saatte randevu yok');
    onDone?.();
  }

  return (
    <>
      <Button title={`${staff.name}: gecikme var`} icon="time-outline" variant="secondary" size="sm" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Gecikme var" subtitle={`${staff.name} · önümüzdeki 3 saatteki müşterilere haber verilir`}>
        <Minutes options={DELAY_MINUTES} busy={busy} onPick={send} />
        {error ? (
          <Text variant="label" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title="Vazgeç" variant="ghost" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
