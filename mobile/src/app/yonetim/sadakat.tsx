import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { KeyboardScreen } from '@/components/keyboard-screen';
import { PlanGate } from '@/components/plan-gate';
import { Banner, Button, Card, Field, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Business, LoyaltyCustomer } from '@/lib/types';

export default function LoyaltyScreen() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <View style={styles.screen}>
      <PlanGate business={business} feature="loyalty" title="Sadakat kartı">
        <Loyalty business={business} />
      </PlanGate>
    </View>
  );
}

function Loyalty({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const enabled = business.loyalty_target !== null;
  const [target, setTarget] = useState(String(business.loyalty_target ?? 10));
  const [reward, setReward] = useState(business.loyalty_reward);
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('business_loyalty', { p_business_id: business.id });
    if (error) return setError(errorMessage(error));
    setCustomers((data ?? []) as LoyaltyCustomer[]);
  }, [business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- liste ilk açılışta yüklenir (web ile aynı)
    load();
  }, [load, business.loyalty_target]);

  async function save(next: { loyalty_target: number | null; loyalty_reward: string }) {
    setBusy(true);
    setError('');
    const { error } = await supabase.from('businesses').update(next).eq('id', business.id);
    if (error) setError(errorMessage(error));
    else await refresh();
    setBusy(false);
  }

  function submit() {
    const n = Number(target);
    if (!Number.isInteger(n) || n < 2 || n > 50) return setError('Randevu sayısı 2 ile 50 arasında olmalı.');
    if (!reward.trim()) return setError('Ödülü yazın.');
    save({ loyalty_target: n, loyalty_reward: reward.trim() });
  }

  async function give(c: LoyaltyCustomer) {
    setError('');
    const { error } = await supabase.rpc('give_loyalty_reward', { p_business_id: business.id, p_customer_id: c.customer_id });
    if (error) return setError(errorMessage(error));
    load();
  }

  return (
    <KeyboardScreen style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">İsterseniz açın: tamamlanan her randevu müşteriye bir damga kazandırır, ödülü siz verirsiniz.</Text>
        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

        <Card style={{ gap: 12 }}>
          <Field label="Kaç randevuda" keyboardType="number-pad" value={target} onChangeText={setTarget} maxLength={2} />
          <Field label="Ödül" placeholder="Örn. Saç yıkama bedava" value={reward} onChangeText={setReward} maxLength={100} />
          <Button title={enabled ? 'Kaydet' : 'Kartı aç'} icon="gift-outline" loading={busy} onPress={submit} />
          {enabled && <Button title="Kartı kapat" variant="secondary" disabled={busy} onPress={() => save({ loyalty_target: null, loyalty_reward: '' })} />}
        </Card>

        {enabled && customers.length === 0 && <Text tone="muted">Henüz damga kazanan müşteri yok. Elle eklenen randevular damga kazandırmaz.</Text>}
        {enabled &&
          customers.map((c) => (
            <Card key={c.customer_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{c.customer_name}</Text>
                <Text variant="caption" tone="muted">
                  {c.visits} randevu{c.available > 0 ? ` · ${c.available} ödül bekliyor` : ''}
                </Text>
              </View>
              {c.available > 0 && <Button title="Ödülü verdim" size="sm" variant="secondary" onPress={() => give(c)} />}
            </Card>
          ))}
      </ScrollView>
    </KeyboardScreen>
  );
}
