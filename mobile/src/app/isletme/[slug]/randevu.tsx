import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentTicket } from '@/components/appointment-ticket';
import { Glow } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { Banner, Button, Card, Empty, Field, Loading, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { categoryIcon, categoryLabel, type IconName } from '@/lib/constants';
import { errorMessage, formatDate, formatDuration, formatPrice, formatTime, googleCalendarLink } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service } from '@/lib/types';

type Data = { business: Business; service: Service; staffName: string | null };

export default function BookingScreen() {
  const { slug, service: serviceId, staff: staffId, time } = useLocalSearchParams<{ slug: string; service: string; staff?: string; time: string }>();
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

  useEffect(() => {
    (async () => {
      const { data: business } = await supabase.from('businesses').select('*').eq('slug', slug).maybeSingle();
      if (!business) return setData(null);
      const { data: service } = await supabase.from('services').select('*').eq('id', serviceId).eq('business_id', business.id).maybeSingle();
      if (!service) return setData(null);
      const { data: staff } = staffId ? await supabase.from('staff').select('name').eq('id', staffId).maybeSingle() : { data: null };
      setData({ business, service, staffName: staff?.name ?? null });
    })();
  }, [slug, serviceId, staffId]);

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

  const { business, service } = data;
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
    });
    setBusy(false);
    if (error) {
      haptic.error();
      setError(errorMessage(error));
      setTaken(error.message.includes('müsait değil'));
      return;
    }
    haptic.success();
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
            price={Number(service.price)}
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
                router.navigate('/randevular');
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Summary data={data} time={time} ends={ends} onChange={() => router.back()} />

        {taken ? (
          <Banner tone="danger" icon="time-outline" title="Bu saat az önce doldu" text="Başka bir saat seçmek için dokunun." onPress={() => router.back()} />
        ) : error ? (
          <Banner tone="danger" icon="alert-circle-outline" text={error} />
        ) : null}

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
          title={Number(service.price) > 0 ? `Randevuyu onayla · ${formatPrice(service.price)}` : 'Randevuyu onayla'}
          size="lg"
          onPress={book}
          loading={busy}
          disabled={taken || !session}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Summary({ data, time, ends, onChange }: { data: Data; time: string; ends: string; onChange?: () => void }) {
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
      {Number(service.price) > 0 && <Row icon="pricetag-outline" label="Ücret" value={`${formatPrice(service.price)} · işletmede ödenir`} />}
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
