import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { KeyboardScreen } from '@/components/keyboard-screen';
import { useToast } from '@/components/toast';
import { Button, Card, Field, LoadError, Segmented, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import type { BillingProfile, Business } from '@/lib/types';

export default function BillingScreen() {
  const { business } = useAuth();
  return business ? <Billing business={business} /> : null;
}

/** Esnafın fatura bilgileri (web: components/billing-form.tsx). Ödeme onaylanınca o anki bilgi ödeme kaydına kopyalanır. */
function Billing({ business }: { business: Business }) {
  const toast = useToast();
  const [form, setForm] = useState({ kind: 'individual' as BillingProfile['kind'], legal_name: '', tax_id: '', tax_office: '', address: '' });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const company = form.kind === 'company';

  const load = useCallback(() => {
    setFailed(false);
    supabase
      .from('billing_profiles')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setFailed(true);
        if (data) {
          const p = data as BillingProfile;
          setForm({ kind: p.kind, legal_name: p.legal_name, tax_id: p.tax_id, tax_office: p.tax_office, address: p.address });
        }
        setLoaded(true);
      });
  }, [business.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk açılışta yükle
    load();
  }, [load]);

  async function save() {
    setError('');
    const taxId = form.tax_id.trim();
    if (form.legal_name.trim().length < 2) return setError(company ? 'Ticaret unvanını yazın.' : 'Adınızı ve soyadınızı yazın.');
    if (!(company ? /^\d{10}$/ : /^\d{11}$/).test(taxId)) {
      return setError(company ? 'Vergi numarası 10 haneli olmalı.' : 'T.C. kimlik numarası 11 haneli olmalı.');
    }
    if (company && !form.tax_office.trim()) return setError('Vergi dairesini yazın.');
    if (form.address.trim().length < 5) return setError('Fatura adresini yazın.');
    setBusy(true);
    const { error } = await supabase.from('billing_profiles').upsert({
      ...form,
      business_id: business.id,
      legal_name: form.legal_name.trim(),
      tax_id: taxId,
      tax_office: company ? form.tax_office.trim() : '',
      address: form.address.trim(),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    haptic.success();
    toast('Fatura bilgileriniz kaydedildi.');
    router.back();
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <KeyboardScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">Faturanız bu bilgilerle düzenlenir. Ödemeden önce girin; ödeme anındaki bilgi esas alınır.</Text>
        {failed ? (
          <LoadError onRetry={load} />
        ) : !loaded ? (
          <Skeleton height={280} />
        ) : (
          <Card style={{ gap: 14 }}>
            <Segmented
              value={form.kind}
              onChange={(kind) => setForm((f) => ({ ...f, kind }))}
              options={[
                { value: 'individual', label: 'Şahıs' },
                { value: 'company', label: 'Şirket' },
              ]}
            />
            <Field label={company ? 'Ticaret unvanı' : 'Ad soyad'} value={form.legal_name} onChangeText={set('legal_name')} maxLength={200} autoCapitalize="words" />
            <Field
              label={company ? 'Vergi numarası' : 'T.C. kimlik numarası'}
              value={form.tax_id}
              onChangeText={(v) => set('tax_id')(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={company ? 10 : 11}
            />
            {company ? <Field label="Vergi dairesi" value={form.tax_office} onChangeText={set('tax_office')} maxLength={100} autoCapitalize="words" /> : null}
            <Field label="Fatura adresi" value={form.address} onChangeText={set('address')} maxLength={300} multiline autoCapitalize="sentences" />
            {error ? (
              <Text variant="label" tone="danger">
                {error}
              </Text>
            ) : null}
            <Button title="Kaydet" icon="receipt-outline" onPress={save} loading={busy} />
          </Card>
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}
