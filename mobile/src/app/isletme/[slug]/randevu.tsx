import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentTicket } from '@/components/appointment-ticket';
import { Glow } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { KeyboardScreen } from '@/components/keyboard-screen';
import { Banner, Button, Card, Empty, Field, Loading, SectionTitle, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { categoryIcon, categoryLabel, isShowcase, isSubscribed, type IconName } from '@/lib/constants';
import { couponFits, couponPrice, formatDiscount, formatMoney, useShopCoupons } from '@/lib/coupons';
import { errorMessage, formatDate, formatDuration, formatPrice, formatTime, googleCalendarLink } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service } from '@/lib/types';

// service: gösterim için birleşik (ad, süre ve fiyat toplam); base: ana hizmet (kupon yalnızca ona, bir kişiye uygulanır).
type Data = { business: Business; service: Service; base: Service; extraIds: string[]; party: number; staffName: string | null; couponsEnabled: boolean };

export default function BookingScreen() {
  const { slug, service: serviceId, staff: staffId, time, extra, party: partyParam } = useLocalSearchParams<{
    slug: string;
    service: string;
    staff?: string;
    time: string;
    extra?: string;
    party?: string;
  }>();
  const { session, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  // null = kullanıcı henüz yazmadı; profil bilgisiyle doldurulur.
  const [input, setInput] = useState<{ name: string | null; phone: string | null; note: string }>({ name: null, phone: null, note: '' });
  const form = { name: input.name ?? profile?.full_name ?? '', phone: input.phone ?? profile?.phone ?? '', note: input.note };
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState(false);
  // Alınan randevunun durumu; sık iptal eden müşteride işletme ayarından bağımsız "pending" olur.
  const [booked, setBooked] = useState<'pending' | 'confirmed' | null>(null);
  // Sunucunun hesapladığı ödenecek tutar (kuponluysa indirimli)
  const [bookedPrice, setBookedPrice] = useState<number | null>(null);
  // Seçim hangi hizmet ve saat için yapıldıysa onunla anılır; hizmet ya da saat değişirse eski seçim geçersiz sayılır.
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null);
  const { coupons, claims } = useShopCoupons(data?.business.id ?? '', !!data?.couponsEnabled);

  useEffect(() => {
    (async () => {
      const { data: business } = await supabase.from('businesses').select('*').eq('slug', slug).maybeSingle();
      if (!business) return setData(null);
      // Vitrin işletme randevu almaz: doğrudan adresle gelinirse dükkân sayfasına dönülür.
      if (isShowcase(business)) return router.replace({ pathname: '/isletme/[slug]', params: { slug: business.slug } });
      const { data: service } = await supabase.from('services').select('*').eq('id', serviceId).eq('business_id', business.id).maybeSingle();
      if (!service) return setData(null);
      const extraIds = (extra ?? '').split(',').filter(Boolean);
      const party = Math.min(Math.max(Number(partyParam) || 1, 1), 4);
      const { data: extras } = extraIds.length
        ? await supabase.from('services').select('*').in('id', extraIds).eq('business_id', business.id)
        : { data: [] as Service[] };
      if ((extras ?? []).length !== extraIds.length) return setData(null);
      const all = [service as Service, ...extraIds.map((id) => (extras as Service[]).find((x) => x.id === id)!)];
      const combined: Service = {
        ...service,
        name: all.map((x) => x.name).join(' + ') + (party > 1 ? ` · ${party} kişi` : ''),
        duration_minutes: all.reduce((t, x) => t + x.duration_minutes, 0) * party,
        price: all.reduce((t, x) => t + Number(x.price), 0) * party,
      };
      const { data: staff } = staffId ? await supabase.from('staff').select('name').eq('id', staffId).maybeSingle() : { data: null };
      // Kuponlar paketle gelir; paket düşerse sunulmaz.
      const { data: plan } = await supabase.from('plans').select('features').eq('id', business.plan_id ?? '').maybeSingle();
      const couponsEnabled = isSubscribed(business) && (plan?.features ?? []).includes('coupons');
      setData({ business, service: combined, base: service, extraIds, party, staffName: staff?.name ?? null, couponsEnabled });
    })();
  }, [slug, serviceId, staffId, extra, partyParam]);

  if (data === undefined) return <Loading full />;
  if (data === null) {
    return (
      <View style={styles.screen}>
        <Empty icon="alert-circle-outline" title="Randevu bilgisi bulunamadı" text="İşletme veya hizmet artık online randevu almıyor olabilir.">
          <Button title="Geri dön" variant="secondary" onPress={() => router.back()} />
        </Empty>
      </View>
    );
  }

  const { business, service, base, extraIds, party } = data;
  // İndirim bir kişinin ana hizmetine uygulanır (book_appointment ile aynı).
  const discounted = (c: Parameters<typeof couponPrice>[1]) => Number(service.price) - Number(base.price) + couponPrice(Number(base.price), c);
  // Seçilen hizmet ve saate uyan kuponlar (gösterim için; asıl denetim sunucuda). Kullanılmış ya da başka randevuya
  // bağlı kod, hakkı biten kupon ve fiyatsız hizmet sunulmaz.
  // Durdurulmuş kuponu önceden alan müşterinin kodu hâlâ geçerli: açık kuponlara alınmış (active) kodlar da eklenir.
  const candidates = [
    ...coupons,
    ...claims.filter((x) => x.state === 'active' && !coupons.some((c) => c.id === x.coupon_id)).map((x) => ({ ...x, id: x.coupon_id })),
  ];
  const offers =
    session && Number(base.price) > 0
      ? candidates.filter((c) => {
          if (!couponFits(c, service.id, time)) return false;
          const mine = claims.find((x) => x.coupon_id === c.id);
          if (mine) return mine.state === 'active';
          return 'total_limit' in c && (c.total_limit === null || c.claimed_count < c.total_limit);
        })
      : [];
  const pickKey = `${service.id}|${time}`;
  const chosen = offers.find((c) => pick?.key === pickKey && pick.id === c.id);
  const errors = {
    name: form.name.trim().length < 2 ? 'Adınızı ve soyadınızı yazın.' : '',
    phone: form.phone.replace(/\D/g, '').length < 10 ? 'Geçerli bir telefon numarası yazın.' : '',
  };

  async function book() {
    setTouched(true);
    if (errors.name || errors.phone) return haptic.error();
    setBusy(true);
    setError('');
    const { data: result, error } = await supabase.rpc('book_appointment', {
      p_business_id: business.id,
      p_service_id: service.id,
      p_staff_id: staffId || null,
      p_starts_at: time,
      p_customer_name: form.name.trim(),
      p_customer_phone: form.phone.trim(),
      p_note: form.note.trim(),
      ...(chosen && { p_coupon_id: chosen.id }),
      ...(extraIds.length ? { p_extra_service_ids: extraIds } : {}),
      ...(party > 1 ? { p_party_size: party } : {}),
    });
    setBusy(false);
    if (error) {
      haptic.error();
      setError(errorMessage(error));
      setTaken(error.message.includes('müsait değil'));
      return;
    }
    haptic.success();
    setBookedPrice(Number((result as { price?: number } | null)?.price ?? service.price));
    setBooked((result as { status: 'pending' | 'confirmed' } | null)?.status ?? (business.auto_confirm ? 'confirmed' : 'pending'));
  }

  const ends = new Date(new Date(time).getTime() + service.duration_minutes * 60000).toISOString();
  const location = [business.address, business.district, business.city].filter(Boolean).join(', ');

  if (booked) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <Glow height={420} opacity={0.28} />
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: 24 }]}>
          <AppointmentTicket
            businessName={business.name}
            serviceName={service.name}
            staffName={data.staffName ?? undefined}
            startsAt={time}
            durationMinutes={service.duration_minutes}
            price={bookedPrice ?? Number(service.price)}
            place={location}
            confirmed={booked === 'confirmed'}
          />
          <Animated.View entering={FadeInDown.delay(250).duration(300)} style={{ gap: 12, marginTop: 8 }}>
            <Text tone="muted" style={{ textAlign: 'center', marginBottom: 4 }}>
              {booked === 'confirmed'
                ? 'Randevunuz onaylandı. Görüşmek üzere!'
                : 'İşletme onayladığında kesinleşecek. Durumunu Randevularım’dan takip edebilirsiniz.'}
            </Text>
            <Button
              title="Takvime ekle"
              icon="calendar-outline"
              variant="secondary"
              onPress={() => Linking.openURL(googleCalendarLink(`${business.name} — ${service.name}`, time, ends, location))}
            />
            <Button
              title="Randevularım"
              onPress={() => {
                router.dismissAll();
                // İşletme sahibinin aldığı randevular sekmede değil ayrı ekranda.
                if (profile?.role === 'business') router.push('/randevularim');
                else router.navigate('/randevular');
              }}
            />
            <Button
              title="Keşfete dön"
              variant="ghost"
              onPress={() => {
                router.dismissAll();
                router.navigate('/');
              }}
            />
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Summary data={data} time={time} ends={ends} onChange={() => router.back()} discounted={chosen ? discounted(chosen) : null} />

        {taken ? (
          <Banner tone="danger" icon="time-outline" title="Bu saat az önce doldu" text="Başka bir saat seçmek için dokunun." onPress={() => router.back()} />
        ) : error ? (
          <Banner tone="danger" icon="alert-circle-outline" text={error} />
        ) : null}

        {offers.length > 0 && (
          <>
            <SectionTitle title="Kupon" />
            <Card style={{ padding: 0 }}>
              {[null, ...offers].map((c, i) => {
                const on = (c?.id ?? '') === (chosen?.id ?? '');
                return (
                  <View key={c?.id ?? ''}>
                    {i > 0 && <View style={{ height: 1, backgroundColor: colors.line }} />}
                    <Pressable
                      onPress={() => {
                        haptic.select();
                        setPick(c ? { key: pickKey, id: c.id } : null);
                      }}
                      accessibilityRole="radio"
                      aria-checked={on}
                      style={[styles.rowCenter, { gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52 }]}>
                      <Text variant={on ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
                        {c ? `${c.title} · ${formatDiscount(c)}` : 'Kuponsuz'}
                      </Text>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.brand300 : colors.ink3} />
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {!session ? (
          <Card style={{ gap: 12 }}>
            <Text variant="bodyStrong">Randevu için giriş yapın</Text>
            <Text tone="muted">Hesabınızla randevularınızı takip eder, gerekirse erteler veya iptal edersiniz.</Text>
            <Button title="Giriş yap" onPress={() => router.push('/giris')} />
            <Button title="Hesap aç" variant="secondary" onPress={() => router.push('/kayit')} />
          </Card>
        ) : (
          <>
            <Text variant="heading" style={{ marginTop: 4 }}>
              İletişim bilgileriniz
            </Text>
            <Field
              label="Ad Soyad"
              icon="person-outline"
              value={form.name}
              onChangeText={(name) => setInput({ ...input, name })}
              autoComplete="name"
              textContentType="name"
              error={touched ? errors.name : ''}
            />
            <Field
              label="Telefon"
              icon="call-outline"
              value={form.phone}
              onChangeText={(phone) => setInput({ ...input, phone })}
              keyboardType="phone-pad"
              placeholder="05xx xxx xx xx"
              autoComplete="tel"
              textContentType="telephoneNumber"
              error={touched ? errors.phone : ''}
            />
            <Field
              label="Not (isteğe bağlı)"
              icon="chatbubble-outline"
              value={form.note}
              onChangeText={(note) => setInput({ ...input, note })}
              maxLength={500}
              placeholder="İşletmeye iletmek istedikleriniz"
              multiline
            />
          </>
        )}
      </ScrollView>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <Button
          title={
            Number(service.price) > 0
              ? `Randevuyu onayla · ${chosen ? formatMoney(discounted(chosen)) : formatPrice(service.price)}`
              : 'Randevuyu onayla'
          }
          size="lg"
          onPress={book}
          loading={busy}
          disabled={taken || !session}
        />
      </View>
    </KeyboardScreen>
  );
}

function Summary({ data, time, ends, onChange, discounted }: { data: Data; time: string; ends: string; onChange?: () => void; discounted: number | null }) {
  const { business, service, staffName } = data;
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.rowCenter}>
        <Logo business={business} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {business.name}
          </Text>
          <Text variant="caption" tone="muted">
            {categoryLabel(business.category)}
          </Text>
        </View>
        {onChange && <Button title="Değiştir" variant="ghost" size="sm" onPress={onChange} />}
      </View>
      <View style={s.divider} />
      <Row icon="calendar-outline" label="Tarih" value={formatDate(time)} />
      <Row icon="time-outline" label="Saat" value={`${formatTime(time)} – ${formatTime(ends)}`} />
      <Row icon={categoryIcon(business.category)} label="Hizmet" value={`${service.name} · ${formatDuration(service.duration_minutes)}`} />
      {staffName && <Row icon="person-outline" label="Personel" value={staffName} />}
      {Number(service.price) > 0 && (
        <Row
          icon="pricetag-outline"
          label="Ücret"
          value={discounted === null ? `${formatPrice(service.price)} · işletmede ödenir` : `${formatMoney(discounted)} (kuponlu, liste fiyatı ${formatPrice(service.price)}) · işletmede ödenir`}
        />
      )}
    </Card>
  );
}

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.rowCenter}>
      <Ionicons name={icon} size={18} color={colors.brand300} />
      <Text tone="muted" style={{ width: 74 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  divider: { height: 1, backgroundColor: colors.line },
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
