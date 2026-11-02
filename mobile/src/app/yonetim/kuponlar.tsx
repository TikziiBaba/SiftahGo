import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { CouponForm } from '@/components/coupon-form';
import { CouponRedeem } from '@/components/coupon-redeem';
import { PlanGate } from '@/components/plan-gate';
import { Badge, Banner, Button, Card, Empty, IconButton, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
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

function Coupons({ business }: { business: Business }) {
  const scrollRef = useRef<ScrollView>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  // editing: null kapalı, "new" yeni kupon, Coupon düzenleme
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.rpc('business_coupons', { p_business_id: business.id }),
      supabase.from('services').select('*').eq('business_id', business.id).order('sort_order').order('created_at'),
    ]);
    if (c.error) setError(errorMessage(c.error));
    setCoupons((c.data ?? []) as Coupon[]);
    setServices((s.data ?? []) as Service[]);
  }, [business.id]);

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">Müşterilerinize gerçek indirim verin; kasada kodla kullandırın.</Text>
        <Button title="Kupon aç" icon="add" onPress={() => open('new')} />

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

        <CouponRedeem businessId={business.id} />

        {editing && (
          <CouponForm
            key={editing === 'new' ? 'new' : editing.id}
            coupon={editing === 'new' ? null : editing}
            services={services}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}

        {coupons === null && <Skeleton height={96} />}
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
    </KeyboardAvoidingView>
  );
}
