import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Banner, Button, Card, SectionTitle, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { BASE_FEATURES, isSubscribed, isTrial, PLAN_FEATURES, WEB_URL } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/format';
import { daysLeft } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Payment, Plan } from '@/lib/types';

const POPULAR = 'esnaf';

const PAYMENT_STATUS = {
  paid: { label: 'Ödendi', fg: colors.success, bg: colors.successTint },
  pending: { label: 'Bekliyor', fg: colors.warning, bg: colors.warningTint },
  failed: { label: 'Başarısız', fg: colors.danger, bg: colors.dangerTint },
};

export default function SubscriptionScreen() {
  const { business } = useAuth();
  return business ? <Subscription business={business} /> : null;
}

function Subscription({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const subscribed = isSubscribed(business);
  const trial = isTrial(business);
  const current = plans?.find((p) => p.id === business.plan_id);

  const load = useCallback(async () => {
    const [p, pay] = await Promise.all([
      supabase.from('plans').select('*').order('sort_order'),
      supabase.from('payments').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(10),
    ]);
    setPlans((p.data ?? []) as Plan[]);
    setPayments((pay.data ?? []) as Payment[]);
    setRefreshing(false);
  }, [business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paketleri ilk açılışta yükle
    load();
  }, [load]);

  // Ödeme web sitesindeki PayTR sayfasında yapılır; tarayıcı kapanınca durum tazelenir.
  async function pay() {
    await WebBrowser.openBrowserAsync(`${WEB_URL}/panel/abonelik`);
    await refresh();
    load();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.brand}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surface2}
          onRefresh={() => {
            setRefreshing(true);
            refresh();
            load();
          }}
        />
      }>
      <Card style={{ gap: 6 }}>
        <Text variant="overline" tone="muted">
          Mevcut durum
        </Text>
        {trial ? (
          <>
            <Text variant="title">Ücretsiz deneme (Pro)</Text>
            <Text tone="secondary">
              {formatDate(business.subscription_ends_at!, false)} tarihine kadar · {daysLeft(business.subscription_ends_at)} gün kaldı
            </Text>
            <Text tone="muted">Deneme bitince sayfanız yayından kalkar. Şimdi paket seçerseniz paketiniz hemen başlar, kalan deneme günleri de üstüne eklenir.</Text>
          </>
        ) : subscribed ? (
          <>
            <Text variant="title">{current?.name ?? 'Paket'} paketi</Text>
            <Text tone="secondary">
              {formatDate(business.subscription_ends_at!, false)} tarihine kadar · {daysLeft(business.subscription_ends_at)} gün kaldı
            </Text>
          </>
        ) : (
          <>
            <Text variant="title" tone="warning">
              Aktif paketiniz yok
            </Text>
            <Text tone="muted">Paket seçene kadar sayfanız yayında görünmez ve randevu alınamaz.</Text>
          </>
        )}
      </Card>

      <Banner
        icon="globe-outline"
        text="Ödeme, web sitemizdeki güvenli PayTR sayfasında yapılır; aynı hesapla (e-posta veya Google) giriş yapmanız istenebilir. Ödemeden sonra bu ekrana dönün."
      />

      <SectionTitle title="Paketler" />
      {plans === null ? (
        <>
          <Skeleton height={260} />
          <Skeleton height={260} />
        </>
      ) : (
        plans.map((plan) => {
          const popular = plan.id === POPULAR;
          const isCurrent = subscribed && !trial && plan.id === business.plan_id;
          return (
            <Card key={plan.id} style={[{ gap: 14 }, popular && s.popular]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text variant="heading">{plan.name}</Text>
                {isCurrent ? (
                  <Badge label="Mevcut paket" fg={colors.success} bg={colors.successTint} icon="checkmark-circle" />
                ) : popular ? (
                  <Badge label="En çok tercih edilen" fg={colors.brand200} bg={colors.brandTint} />
                ) : null}
              </View>
              <Text>
                <Text variant="display">{formatPrice(plan.price)}</Text>
                <Text tone="muted"> / ay</Text>
              </Text>
              <View style={{ gap: 8 }}>
                <Feature>{plan.staff_limit ? `${plan.staff_limit} personel` : 'Sınırsız personel'}</Feature>
                {BASE_FEATURES.map((f) => (
                  <Feature key={f}>{f}</Feature>
                ))}
                {Object.entries(PLAN_FEATURES).map(([key, label]) => (
                  <Feature key={key} off={!plan.features.includes(key)}>
                    {label}
                  </Feature>
                ))}
              </View>
              <Button
                title={isCurrent ? '30 gün uzat' : subscribed && !trial ? 'Bu pakete geç' : 'Seç ve öde'}
                icon="open-outline"
                variant={popular ? 'primary' : 'secondary'}
                onPress={pay}
              />
            </Card>
          );
        })
      )}
      <View style={[styles.rowCenter, { paddingHorizontal: 4 }]}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand300} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          Paketler aylıktır, taahhüt yok. Her ödeme 30 gün geçerlidir ve kalan sürenize eklenir.
        </Text>
      </View>

      {payments.length > 0 && (
        <>
          <SectionTitle title="Ödeme geçmişi" />
          <Card style={{ gap: 12 }}>
            {payments.map((p) => (
              <View key={p.id} style={styles.rowCenter}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">
                    {plans?.find((x) => x.id === p.plan_id)?.name ?? p.plan_id} · {formatPrice(p.amount)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatDate(p.created_at)}
                  </Text>
                </View>
                <Badge label={PAYMENT_STATUS[p.status].label} fg={PAYMENT_STATUS[p.status].fg} bg={PAYMENT_STATUS[p.status].bg} />
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Feature({ children, off }: { children: React.ReactNode; off?: boolean }) {
  return (
    <View style={[styles.rowCenter, { gap: 10 }]}>
      <View style={[s.check, off && { backgroundColor: colors.white04 }]}>
        <Ionicons name={off ? 'close' : 'checkmark'} size={12} color={off ? colors.ink3 : colors.brand300} />
      </View>
      <Text tone={off ? 'muted' : 'secondary'} style={[{ flex: 1 }, off && { textDecorationLine: 'line-through' }]}>
        {children}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  popular: { borderColor: colors.brandRing, backgroundColor: colors.brandSoft },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
