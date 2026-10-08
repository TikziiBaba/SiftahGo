import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { Logo } from '@/components/business-logo';
import { Button, Card, Field, Loading, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { categoryLabel, colors, WEEKDAYS } from '@/lib/constants';
import {
  addDays,
  errorMessage,
  formatDate,
  formatDuration,
  formatPrice,
  formatTime,
  googleCalendarLink,
  isoWeekday,
  shortDay,
  todayStr,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Business, Review, Service, Staff, StaffService, WorkingHour } from '@/lib/types';

type Data = { business: Business; services: Service[]; staff: Staff[]; links: StaffService[]; hours: WorkingHour[]; reviews: Review[] };

export default function BusinessScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, profile } = useAuth();
  const [data, setData] = useState<Data | null | undefined>(undefined);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState('');
  const [day, setDay] = useState(todayStr);
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  // null = kullanıcı henüz yazmadı; profil bilgisiyle doldurulur.
  const [input, setInput] = useState<{ name: string | null; phone: string | null; note: string }>({ name: null, phone: null, note: '' });
  const form = { name: input.name ?? profile?.full_name ?? '', phone: input.phone ?? profile?.phone ?? '', note: input.note };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: business } = await supabase.from('businesses').select('*').eq('slug', slug).maybeSingle();
      if (!business) return setData(null);
      const [s, st, h, r] = await Promise.all([
        supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('staff').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('working_hours').select('*').eq('business_id', business.id).order('weekday'),
        supabase.from('reviews').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(10),
      ]);
      const staff = st.data ?? [];
      const { data: links } = staff.length
        ? await supabase.from('staff_services').select('*').in('staff_id', staff.map((x) => x.id))
        : { data: [] };
      setData({ business, services: s.data ?? [], staff, links: links ?? [], hours: h.data ?? [], reviews: r.data ?? [] });
    })();
  }, [slug]);

  const slotKey = `${serviceId}|${staffId}|${day}|${reload}`;
  const times = slotResult?.key === slotKey ? slotResult.times : null;

  useEffect(() => {
    if (!data || !serviceId) return;
    let active = true;
    const key = `${serviceId}|${staffId}|${day}|${reload}`;
    supabase
      .rpc('get_available_slots', { p_business_id: data.business.id, p_service_id: serviceId, p_day: day, p_staff_id: staffId || null })
      .then(({ data: rows }) => {
        if (!active) return;
        setSlotResult({ key, times: [...new Set(((rows ?? []) as { slot_start: string }[]).map((r) => r.slot_start))] });
      });
    return () => {
      active = false;
    };
  }, [data, serviceId, staffId, day, reload]);

  const days = useMemo(() => {
    if (!data) return [];
    const start = todayStr();
    return Array.from({ length: Math.min(data.business.booking_days, 30) + 1 }, (_, i) => {
      const d = addDays(start, i);
      return { day: d, open: data.hours.find((h) => h.weekday === isoWeekday(d))?.is_open ?? false };
    });
  }, [data]);

  if (data === undefined) return <Loading />;
  if (data === null) {
    return (
      <View style={[styles.content, { alignItems: 'center' }]}>
        <Text style={styles.h2}>İşletme bulunamadı</Text>
      </View>
    );
  }

  const { business, services, hours, links, reviews } = data;
  const service = services.find((s) => s.id === serviceId);
  // Kaydı olmayan personel tüm hizmetleri verir.
  const staff = data.staff.filter(
    (p) => !links.some((l) => l.staff_id === p.id) || links.some((l) => l.staff_id === p.id && l.service_id === serviceId),
  );
  const location = [business.address, business.district, business.city].filter(Boolean).join(', ');

  async function book() {
    if (!service || !time) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('book_appointment', {
      p_business_id: business.id,
      p_service_id: service.id,
      p_staff_id: staffId || null,
      p_starts_at: time,
      p_customer_name: form.name,
      p_customer_phone: form.phone,
      p_note: form.note,
    });
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      if (error.message.includes('müsait değil')) {
        setTime(null);
        setReload((r) => r + 1);
      }
      return;
    }
    setBooked(true);
  }

  if (booked && service && time) {
    return (
      <View style={[styles.content, { alignItems: 'center', paddingTop: 48, gap: 14 }]}>
        <Ionicons name="checkmark-circle" size={72} color="#059669" />
        <Text style={styles.h1}>Randevunuz alındı!</Text>
        <Text style={[styles.muted, { textAlign: 'center', fontSize: 16 }]}>
          {business.name}{'\n'}
          {formatDate(time)} · {formatTime(time)}{'\n'}
          {service.name}
        </Text>
        <Text style={styles.muted}>
          {business.auto_confirm ? 'Randevunuz onaylandı.' : 'İşletme onayladığında kesinleşecek.'}
        </Text>
        <Button
          title="Takvime ekle"
          variant="secondary"
          style={{ alignSelf: 'stretch' }}
          onPress={() =>
            Linking.openURL(
              googleCalendarLink(
                `${business.name} — ${service.name}`,
                time,
                new Date(new Date(time).getTime() + service.duration_minutes * 60000).toISOString(),
                location,
              ),
            )
          }
        />
        {session ? (
          <Button title="Randevularım" onPress={() => router.replace('/randevular')} style={{ alignSelf: 'stretch' }} />
        ) : (
          <Button title="Hesap aç, randevularını takip et" onPress={() => router.push('/kayit')} style={{ alignSelf: 'stretch' }} />
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: business.name }} />
      <View style={{ height: 150, backgroundColor: colors.brand }}>
        {business.cover_url && <Image source={business.cover_url} style={{ flex: 1 }} contentFit="cover" />}
      </View>
      <View style={[styles.content, { marginTop: -40 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ borderWidth: 4, borderColor: '#fff', borderRadius: 22 }}>
            <Logo business={business} size={76} />
          </View>
          <View style={{ flex: 1, paddingBottom: 4 }}>
            <Text style={styles.h1} numberOfLines={2}>{business.name}</Text>
            <Text style={styles.muted}>
              {categoryLabel(business.category)}
              {business.city ? ` · ${business.city}` : ''}
              {business.rating_count > 0 ? `  ★ ${Number(business.rating_avg).toFixed(1)} (${business.rating_count})` : ''}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {business.phone ? (
            <Button title="Ara" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${business.phone}`)} />
          ) : null}
          {location ? (
            <Button
              title="Yol tarifi"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${location}`)}`)}
            />
          ) : null}
        </View>

        {business.description ? <Text style={{ color: '#44403c', lineHeight: 21 }}>{business.description}</Text> : null}

        <Text style={[styles.h2, { marginTop: 8 }]}>1. Hizmet seçin</Text>
        {services.length === 0 && <Text style={styles.muted}>Bu işletme henüz hizmet eklememiş.</Text>}
        {services.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => {
              setServiceId(s.id);
              setStaffId('');
              setTime(null);
            }}
            style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }, s.id === serviceId && { borderColor: colors.brand, backgroundColor: colors.brandLight }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 15, color: colors.text }}>{s.name}</Text>
              <Text style={styles.muted}>{formatDuration(s.duration_minutes)}{s.description ? ` · ${s.description}` : ''}</Text>
            </View>
            <Text style={{ fontWeight: '700', color: colors.text }}>{Number(s.price) > 0 ? formatPrice(s.price) : '—'}</Text>
          </Pressable>
        ))}

        {service && staff.length > 1 && (
          <>
            <Text style={[styles.h2, { marginTop: 8 }]}>2. Personel seçin</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[{ id: '', name: 'Farketmez' }, ...staff].map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setStaffId(p.id);
                    setTime(null);
                  }}
                  style={[styles.chip, p.id === staffId && styles.chipActive]}>
                  <Text style={{ color: p.id === staffId ? '#fff' : colors.text, fontWeight: '500' }}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {service && (
          <>
            <Text style={[styles.h2, { marginTop: 8 }]}>{staff.length > 1 ? 3 : 2}. Gün ve saat</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map(({ day: d, open }) => {
                const s = shortDay(d);
                const selected = d === day;
                return (
                  <Pressable
                    key={d}
                    disabled={!open}
                    onPress={() => {
                      setDay(d);
                      setTime(null);
                    }}
                    style={[styles.card, { width: 62, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 0 }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }, !open && { opacity: 0.35 }]}>
                    <Text style={{ fontSize: 12, color: selected ? '#fff' : colors.muted }}>{s.weekday}</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: selected ? '#fff' : colors.text }}>{s.date}</Text>
                    <Text style={{ fontSize: 12, color: selected ? '#fff' : colors.muted }}>{s.month}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {times === null ? (
              <Loading />
            ) : times.length === 0 ? (
              <Text style={styles.muted}>Bu gün için boş saat yok. Başka bir gün seçin.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {times.map((t) => (
                  <Pressable key={t} onPress={() => setTime(t)} style={[styles.chip, { minWidth: 72, alignItems: 'center' }, t === time && styles.chipActive]}>
                    <Text style={{ color: t === time ? '#fff' : colors.text, fontWeight: '600' }}>{formatTime(t)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {service && time && (
          <Card style={{ gap: 12, marginTop: 8 }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>
              {formatDate(time)}, {formatTime(time)} · {service.name}
            </Text>
            <Field label="Adınız Soyadınız" value={form.name} onChangeText={(name) => setInput({ ...input, name })} autoComplete="name" />
            <Field label="Telefon" value={form.phone} onChangeText={(phone) => setInput({ ...input, phone })} keyboardType="phone-pad" placeholder="05xx xxx xx xx" autoComplete="tel" />
            <Field label="Not (isteğe bağlı)" value={form.note} onChangeText={(note) => setInput({ ...input, note })} maxLength={500} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Randevuyu Onayla" onPress={book} loading={busy} />
          </Card>
        )}

        <Card style={{ gap: 6, marginTop: 8 }}>
          <Text style={styles.h2}>Çalışma saatleri</Text>
          {hours.map((h) => (
            <View key={h.weekday} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.muted}>{WEEKDAYS[h.weekday - 1]}</Text>
              <Text style={{ color: h.is_open ? colors.text : '#a8a29e', fontWeight: '500' }}>
                {h.is_open ? `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}` : 'Kapalı'}
              </Text>
            </View>
          ))}
          {location ? <Text style={[styles.muted, { marginTop: 6 }]}>{location}</Text> : null}
        </Card>

        {reviews.length > 0 && (
          <Card style={{ gap: 12 }}>
            <Text style={styles.h2}>
              ★ {Number(business.rating_avg).toFixed(1)} · {business.rating_count} değerlendirme
            </Text>
            {reviews.map((r) => (
              <View key={r.id} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{r.customer_name}</Text>
                  <Text style={{ color: '#f59e0b' }}>{'★'.repeat(r.rating)}<Text style={{ color: '#d6d3d1' }}>{'★'.repeat(5 - r.rating)}</Text></Text>
                </View>
                {r.comment ? <Text style={{ color: '#44403c' }}>{r.comment}</Text> : null}
              </View>
            ))}
          </Card>
        )}

        {business.gallery.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {business.gallery.map((url) => (
              <Image key={url} source={url} style={{ width: 120, height: 120, borderRadius: 12 }} contentFit="cover" />
            ))}
          </ScrollView>
        )}
      </View>
    </ScrollView>
  );
}
