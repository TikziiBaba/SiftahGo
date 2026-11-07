import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { CouponForm } from '@/components/coupon-form';
import { CouponRedeem } from '@/components/coupon-redeem';
import { KeyboardScreen } from '@/components/keyboard-screen';
import { PlanGate } from '@/components/plan-gate';
import { Badge, Banner, Button, Card, Chip, Empty, Field, IconButton, LoadError, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isShowcase } from '@/lib/constants';
import { formatCouponWhen, formatDiscount } from '@/lib/coupons';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Coupon, Service } from '@/lib/types';

export default function CouponsScreen() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <View style={styles.screen}>
      <PlanGate business={business} feature="coupons" title="Kupon">
        <Coupons business={business} />
      </PlanGate>
    </View>
  );
}

// Doğum günü kuponu (web ile aynı): müşterinin doğum gününe 3 gün kala kendine özel kupon gider.
function BirthdayCoupon({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const on = business.birthday_discount_type !== null;
  const [type, setType] = useState<'percent' | 'fixed'>(business.birthday_discount_type ?? 'percent');
  const [value, setValue] = useState(String(business.birthday_discount_value ?? 20));
  const [summary, setSummary] = useState<{ sent: number; used: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .rpc('business_birthday_summary', { p_business_id: business.id })
      .then(({ data }) => setSummary(data as { sent: number; used: number } | null));
  }, [business.id]);

  async function save(enable: boolean) {
    setError('');
    const n = Number(value.replace(',', '.'));
    if (enable && (!Number.isFinite(n) || n <= 0 || (type === 'percent' && (n < 1 || n > 90)))) {
      return setError(type === 'percent' ? 'Yüzde 1 ile 90 arasında olmalı.' : 'Tutarı girin.');
    }
    setBusy(true);
    const { error } = await supabase
      .from('businesses')
      .update(enable ? { birthday_discount_type: type, birthday_discount_value: n } : { birthday_discount_type: null, birthday_discount_value: null })
      .eq('id', business.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    refresh();
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          Doğum günü kuponu
        </Text>
        {on && <Badge label="Açık" fg={colors.success} />}
      </View>
      <Text variant="caption" tone="muted">
        Doğum gününü ekleyen müşterilerinize (son 2 yılda randevusu gerçekleşmiş) doğum gününe 3 gün kala kendine özel kupon gider;
        doğum gününden 7 gün sonrasına kadar geçerlidir.
      </Text>
      {summary && summary.sent > 0 && (
        <Text variant="caption">
          Bu yıl {summary.sent} müşteriye gönderildi, {summary.used} tanesi kullanıldı.
        </Text>
      )}
      <View style={styles.wrap}>
        <Chip label="Yüzde" selected={type === 'percent'} onPress={() => setType('percent')} />
        <Chip label="Tutar (₺)" selected={type === 'fixed'} onPress={() => setType('fixed')} />
      </View>
      <Field label={type === 'percent' ? 'İndirim (%)' : 'İndirim (₺)'} keyboardType="decimal-pad" value={value} onChangeText={setValue} maxLength={6} />
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Button title={on ? 'Güncelle' : 'Aç'} icon="gift-outline" loading={busy} onPress={() => save(true)} />
      {on && <Button title="Kapat" variant="secondary" disabled={busy} onPress={() => save(false)} />}
    </Card>
  );
}

function Coupons({ business }: { business: Business }) {
  const scrollRef = useRef<ScrollView>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  // editing: null kapalı, "new" yeni kupon, Coupon düzenleme
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const showcase = isShowcase(business);

  const load = useCallback(async () => {
    setFailed(false);
    const [c, s] = await Promise.all([
      supabase.rpc('business_coupons', { p_business_id: business.id }),
      showcase
        ? Promise.resolve({ data: [] })
        : supabase.from('services').select('*').eq('business_id', business.id).order('sort_order').order('created_at'),
    ]);
    if (c.error) return setFailed(true);
    setCoupons((c.data ?? []) as Coupon[]);
    setServices((s.data ?? []) as Service[]);
  }, [business.id, showcase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kuponlar ilk açılışta yüklenir (web ile aynı)
    load();
  }, [load]);

  function open(next: Coupon | 'new') {
    setEditing(next);
    // Form listenin üstünde açılır.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function toggleActive(c: Coupon) {
    setError('');
    const { error } = await supabase.rpc('set_coupon_active', { p_id: c.id, p_active: !c.is_active });
    if (error) return setError(errorMessage(error));
    load();
  }

  function remove(c: Coupon) {
    Alert.alert(`"${c.title}" silinsin mi?`, 'Kupon hiç alınmadığı için silinebilir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setError('');
          const { error } = await supabase.rpc('delete_coupon', { p_id: c.id });
          if (error) return setError(errorMessage(error));
          load();
        },
      },
    ]);
  }

  return (
    <KeyboardScreen style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">Müşterilerinize gerçek indirim verin; kasada kodla kullandırın.</Text>
        <Button title="Kupon aç" icon="add" onPress={() => open('new')} />

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

        <CouponRedeem businessId={business.id} onChange={load} />
        <BirthdayCoupon business={business} />

        {editing && (
          <CouponForm
            key={editing === 'new' ? 'new' : editing.id}
            coupon={editing === 'new' ? null : editing}
            services={services}
            showServices={!showcase}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}

        {failed && coupons === null && <LoadError onRetry={load} />}
        {!failed && coupons === null && <Skeleton height={96} />}
        {coupons?.length === 0 && !editing && <Empty icon="ticket-outline" title="Henüz kupon yok" text="İlk kuponunuzu açın." />}
        {coupons?.map((c) => (
          <Card key={c.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, !c.is_active && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{c.title}</Text>
              {!c.is_active && <Badge label="Durduruldu" />}
              <Text variant="caption" tone="muted">
                {formatDiscount(c)} · {formatCouponWhen(c)}
              </Text>
              <Text variant="caption" tone="muted">
                {c.claimed} alındı · {c.used} kullanıldı{c.total_limit ? ` · sınır ${c.total_limit}` : ''}
              </Text>
            </View>
            <IconButton icon="create-outline" label="Düzenle" onPress={() => open(c)} />
            {c.claimed > 0 ? (
              <IconButton icon={c.is_active ? 'pause-outline' : 'play-outline'} label={c.is_active ? 'Durdur' : 'Yeniden başlat'} onPress={() => toggleActive(c)} />
            ) : (
              <IconButton icon="trash-outline" label="Sil" color={colors.danger} onPress={() => remove(c)} />
            )}
          </Card>
        ))}
      </ScrollView>
    </KeyboardScreen>
  );
}
