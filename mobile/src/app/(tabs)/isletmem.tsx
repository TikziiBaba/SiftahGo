import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Glow } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { Badge, Banner, Button, Card, Group, ListRow, ScreenHeader, SectionTitle, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSubscribed, isTrial, SITE_DOMAIN, WEB_URL } from '@/lib/constants';
import { daysLeft, usePlan } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Business } from '@/lib/types';

export default function BusinessTab() {
  const { business } = useAuth();
  return business ? <Hub business={business} /> : null;
}

function Hub({ business }: { business: Business }) {
  const plan = usePlan(business.plan_id);
  const [counts, setCounts] = useState<{ services: number; staff: number } | null>(null);
  const subscribed = isSubscribed(business);
  const left = daysLeft(business.subscription_ends_at);
  const trial = isTrial(business);
  const link = `${WEB_URL}/${business.slug}`;
  // Paketi olmayan işletme sadece bilgilerini, görsellerini ve aboneliğini düzenler (web ile aynı).
  const locked = !subscribed;

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('staff').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('is_active', true),
      ]).then(([s, st]) => setCounts({ services: s.count ?? 0, staff: st.count ?? 0 }));
    }, [business.id]),
  );

  const status = business.is_suspended
    ? { label: 'Askıda', fg: colors.danger, bg: colors.dangerTint }
    : !subscribed
      ? { label: 'Yayında değil', fg: colors.warning, bg: colors.warningTint }
      : business.is_published
        ? { label: 'Yayında', fg: colors.success, bg: colors.successTint }
        : { label: 'Gizli', fg: colors.ink3, bg: colors.white04 };

  const steps = [
    { title: 'Hizmetlerinizi ekleyin', done: (counts?.services ?? 0) > 0, href: '/yonetim/hizmetler' as const },
    { title: 'Adresinizi yazın', done: !!(business.address || business.district), href: '/yonetim/bilgiler' as const },
    { title: 'Logo yükleyin', done: !!business.logo_url, href: '/yonetim/gorseller' as const },
    { title: 'Paket seçin', done: subscribed && !trial, href: '/yonetim/abonelik' as const },
  ];
  const done = steps.filter((st) => st.done).length;

  return (
    <View style={styles.screen}>
      <Glow />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="İşletmem" />

        <Card style={{ gap: 14, marginTop: 4 }}>
          <View style={[styles.rowCenter, { gap: 14 }]}>
            <Logo business={business} size={60} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="heading" numberOfLines={1}>
                {business.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {SITE_DOMAIN}/{business.slug}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Badge label={status.label} fg={status.fg} bg={status.bg} />
                {subscribed && plan ? <Badge label={`${trial ? 'Deneme' : plan.name} · ${left} gün`} fg={colors.gold} bg={colors.goldTint} icon="sparkles-outline" /> : null}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Sayfam" icon="open-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => WebBrowser.openBrowserAsync(link)} />
            <Button
              title="Paylaş"
              icon="share-social-outline"
              variant="secondary"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => Share.share({ message: `${business.name} — online randevu: ${link}` })}
            />
            <Button title="QR" icon="qr-code-outline" variant="secondary" size="sm" style={{ flex: 1 }} disabled={locked} onPress={() => router.push('/yonetim/qr')} />
          </View>
        </Card>

        {counts && done < steps.length && (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="heading">Kurulumu tamamlayın</Text>
              <Text variant="label" tone="brand">
                {done}/{steps.length}
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.progress, { width: `${(done / steps.length) * 100}%` }]} />
            </View>
            {steps.map((st) => (
              <Pressable
                key={st.title}
                disabled={st.done || (locked && st.href === '/yonetim/hizmetler')}
                onPress={() => router.push(st.href)}
                accessibilityRole="button"
                accessibilityState={{ checked: st.done }}
                style={({ pressed }) => [styles.rowCenter, { gap: 10, paddingVertical: 4 }, pressed && { opacity: 0.7 }]}>
                <Ionicons name={st.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={st.done ? colors.success : colors.ink3} />
                <Text tone={st.done ? 'muted' : 'default'} style={[{ flex: 1 }, st.done && { textDecorationLine: 'line-through' }]}>
                  {st.title}
                </Text>
                {!st.done && <Ionicons name="chevron-forward" size={16} color={colors.ink3} />}
              </Pressable>
            ))}
          </Card>
        )}

        {business.is_suspended ? (
          <Banner tone="danger" icon="alert-circle-outline" text="İşletmeniz yönetici tarafından yayından kaldırıldı. Bilgi için bizimle iletişime geçin." />
        ) : !subscribed ? (
          <Banner
            tone="warning"
            icon="sparkles-outline"
            title="Aktif paketiniz yok"
            text="Paket seçene kadar sayfanız yayında görünmez. Bu sırada bilgilerinizi ve görsellerinizi hazırlayabilirsiniz."
            onPress={() => router.push('/yonetim/abonelik')}
          />
        ) : null}

        <SectionTitle title="Randevu ayarları" />
        <Group>
          <ListRow
            icon="cut-outline"
            title="Hizmetler"
            subtitle="Süre ve fiyatlar"
            value={counts ? String(counts.services) : undefined}
            disabled={locked}
            onPress={() => router.push('/yonetim/hizmetler')}
          />
          <ListRow
            icon="people-outline"
            title="Personel"
            subtitle={plan?.staff_limit ? `Paketiniz ${plan.staff_limit} aktif personele izin veriyor` : 'Kim hangi hizmeti veriyor'}
            value={counts ? String(counts.staff) : undefined}
            disabled={locked}
            onPress={() => router.push('/yonetim/personel')}
          />
          <ListRow icon="time-outline" title="Çalışma saatleri" subtitle="Haftalık saatler, izin ve tatiller" disabled={locked} onPress={() => router.push('/yonetim/saatler')} />
        </Group>

        <SectionTitle title="İşletme" />
        <Group>
          <ListRow icon="storefront-outline" title="İşletme bilgileri" subtitle="Ad, adres, kategori ve randevu kuralları" onPress={() => router.push('/yonetim/bilgiler')} />
          <ListRow icon="images-outline" title="Görseller" subtitle="Logo, kapak ve galeri" onPress={() => router.push('/yonetim/gorseller')} />
          {/* Veritabanında sayfa özelleştirme alanları yoksa (ek dosya çalıştırılmadıysa) gizli kalır. */}
          {'accent' in business && (
            <ListRow icon="color-palette-outline" title="Sayfa görünümü" subtitle="Duyuru, kısayollar ve sayfa rengi" onPress={() => router.push('/yonetim/sayfa')} />
          )}
          <ListRow icon="qr-code-outline" title="QR kod ve bağlantı" subtitle="Dükkânınıza asın, sosyal medyada paylaşın" disabled={locked} onPress={() => router.push('/yonetim/qr')} />
          <ListRow
            icon="star-outline"
            title="Yorumlar"
            subtitle={business.rating_count > 0 ? `${Number(business.rating_avg).toFixed(1)} puan · ${business.rating_count} değerlendirme` : 'Müşteri puanları ve cevaplarınız'}
            onPress={() => router.push('/yonetim/yorumlar')}
          />
        </Group>

        <SectionTitle title="Performans ve hesap" />
        <Group>
          <ListRow
            icon="bar-chart-outline"
            title="Raporlar"
            subtitle="Ciro, randevu ve gelmeme oranı"
            disabled={locked}
            right={plan && !plan.features.includes('reports') ? <Ionicons name="lock-closed" size={14} color={colors.ink3} /> : undefined}
            onPress={() => router.push('/yonetim/raporlar')}
          />
          <ListRow
            icon="card-outline"
            iconColor={colors.gold}
            title="Abonelik"
            subtitle={trial ? `Ücretsiz deneme · ${left} gün kaldı` : subscribed ? `${plan?.name ?? 'Paket'} · ${left} gün kaldı` : 'Paket seçin'}
            onPress={() => router.push('/yonetim/abonelik')}
          />
        </Group>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: 'hidden' },
  progress: { height: 6, borderRadius: radius.pill, backgroundColor: colors.brand },
});
