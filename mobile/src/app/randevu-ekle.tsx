import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalendarSheet, DayStrip, TimeSheet } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Chip, Empty, Field, Loading, SectionTitle, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, errorMessage, formatDate, formatDuration, formatTime, toIso, todayStr } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service, Staff, StaffService } from '@/lib/types';

export default function AddAppointmentScreen() {
  const { business } = useAuth();
  const params = useLocalSearchParams<{ day?: string; name?: string; phone?: string }>();
  return business ? <AddAppointment business={business} params={params} /> : null;
}

type Catalog = { services: Service[]; staff: Staff[]; links: StaffService[] };

function AddAppointment({ business, params }: { business: Business; params: { day?: string; name?: string; phone?: string } }) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState(params.day ?? todayStr());
  const [time, setTime] = useState<string | null>(null);
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [form, setForm] = useState({ name: params.name ?? '', phone: params.phone ?? '', note: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [s, st] = await Promise.all([
        supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('staff').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order').order('created_at'),
      ]);
      const staff = (st.data ?? []) as Staff[];
      const { data: links } = staff.length ? await supabase.from('staff_services').select('*').in('staff_id', staff.map((x) => x.id)) : { data: [] };
      setCatalog({ services: (s.data ?? []) as Service[], staff, links: (links ?? []) as StaffService[] });
    })();
  }, [business.id]);

  // Seçim yapılmadıysa ilk hizmet ve onu verebilen ilk personel (web ile aynı).
  const sid = serviceId ?? catalog?.services[0]?.id ?? null;
  // Kaydı olmayan personel tüm hizmetleri verir.
  const staffOptions = catalog
    ? catalog.staff.filter((p) => !catalog.links.some((l) => l.staff_id === p.id) || catalog.links.some((l) => l.staff_id === p.id && l.service_id === sid))
    : [];
  const stid = staffId && staffOptions.some((p) => p.id === staffId) ? staffId : (staffOptions[0]?.id ?? null);

  const slotKey = `${sid}|${stid}|${day}`;
  const slots = slotResult?.key === slotKey ? slotResult.times : null;

  useEffect(() => {
    if (!sid) return;
    let active = true;
    const key = `${sid}|${stid}|${day}`;
    supabase
      .rpc('get_available_slots', { p_business_id: business.id, p_service_id: sid, p_day: day, p_staff_id: stid })
      .then(({ data }) => {
        if (!active) return;
        setSlotResult({ key, times: [...new Set(((data ?? []) as { slot_start: string }[]).map((r) => formatTime(r.slot_start)))] });
      });
    return () => {
      active = false;
    };
  }, [business.id, sid, stid, day]);

  const days = useMemo(() => Array.from({ length: 60 }, (_, i) => ({ day: addDays(todayStr(), i) })), []);

  if (!catalog) return <Loading full />;
  if (catalog.services.length === 0) {
    return (
      <View style={styles.screen}>
        <Empty icon="cut-outline" title="Önce hizmet ekleyin" text="Randevu eklemek için en az bir aktif hizmetiniz olmalı.">
          <Button title="Hizmet ekle" onPress={() => router.replace({ pathname: '/yonetim/hizmetler/[id]', params: { id: 'yeni' } })} />
        </Empty>
      </View>
    );
  }

  const service = catalog.services.find((x) => x.id === sid);
  const shownTimes = slots && time && !slots.includes(time) ? [...slots, time].sort() : slots;
  const errors = {
    name: form.name.trim().length < 2 ? 'Müşterinin adını yazın.' : '',
    phone: form.phone.replace(/\D/g, '').length < 10 ? 'Geçerli bir telefon numarası yazın.' : '',
  };

  async function save() {
    setTouched(true);
    if (!service) return;
    if (!time) return setError('Bir saat seçin.');
    if (errors.name || errors.phone) return haptic.error();
    setBusy(true);
    setError('');
    const starts = toIso(day, time);
    const { error } = await supabase.from('appointments').insert({
      business_id: business.id,
      service_id: service.id,
      staff_id: stid,
      service_name: service.name,
      price: service.price,
      customer_name: form.name.trim(),
      customer_phone: form.phone.trim(),
      note: form.note.trim(),
      starts_at: starts,
      ends_at: new Date(new Date(starts).getTime() + service.duration_minutes * 60000).toISOString(),
      status: 'confirmed',
    });
    setBusy(false);
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    toast('Randevu eklendi.');
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">Telefonla veya dükkânda alınan randevuları girin; onaylı olarak kaydedilir.</Text>

        <SectionTitle title="Hizmet" />
        <View style={styles.wrap}>
          {catalog.services.map((x) => (
            <Chip
              key={x.id}
              label={`${x.name} · ${formatDuration(x.duration_minutes)}`}
              selected={x.id === sid}
              onPress={() => {
                setServiceId(x.id);
                setTime(null);
              }}
            />
          ))}
        </View>

        {staffOptions.length > 1 && (
          <>
            <SectionTitle title="Personel" />
            <View style={styles.wrap}>
              {staffOptions.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={p.id === stid}
                  onPress={() => {
                    setStaffId(p.id);
                    setTime(null);
                  }}
                />
              ))}
            </View>
          </>
        )}

        <SectionTitle title={`Gün · ${formatDate(day)}`} />
        <DayStrip
          days={days}
          value={day}
          onChange={(d) => {
            setDay(d);
            setTime(null);
          }}
          onMore={() => setCalendarOpen(true)}
        />

        <SectionTitle title="Saat" />
        {shownTimes === null ? (
          <View style={styles.wrap}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={38} style={s.slot} />
            ))}
          </View>
        ) : (
          <>
            {shownTimes.length === 0 && (
              <Text variant="caption" tone="muted">
                Bu gün için önerilen boş saat yok (kapalı gün, dolu takvim veya yayında olmayan sayfa). Saati elle seçebilirsiniz.
              </Text>
            )}
            <View style={styles.wrap}>
              {shownTimes.map((t) => (
                <Chip key={t} label={t} solid selected={t === time} onPress={() => setTime(t)} style={s.slot} />
              ))}
              <Chip label="Diğer" icon="time-outline" onPress={() => setTimeOpen(true)} style={s.slot} />
            </View>
          </>
        )}

        <SectionTitle title="Müşteri" />
        <Field
          label="Ad Soyad"
          icon="person-outline"
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
          error={touched ? errors.name : ''}
          autoCapitalize="words"
        />
        <Field
          label="Telefon"
          icon="call-outline"
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          keyboardType="phone-pad"
          placeholder="05xx xxx xx xx"
          error={touched ? errors.phone : ''}
        />
        <Field label="Not (isteğe bağlı)" icon="chatbubble-outline" value={form.note} onChangeText={(note) => setForm({ ...form, note })} maxLength={500} />
        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      </ScrollView>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        {service && time ? (
          <View style={[styles.rowCenter, { marginBottom: 10 }]}>
            <Ionicons name="calendar-outline" size={16} color={colors.brand300} />
            <Text variant="label" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
              {formatDate(day)} · {time} · {service.name}
            </Text>
          </View>
        ) : null}
        <Button title="Randevuyu kaydet" size="lg" onPress={save} loading={busy} />
      </View>

      <TimeSheet visible={timeOpen} onClose={() => setTimeOpen(false)} title="Saat seçin" value={time} onSelect={setTime} step={15} />
      <CalendarSheet
        key={day}
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        title="Gün seçin"
        value={day}
        onSelect={(d) => {
          setDay(d);
          setTime(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  // Satırda 4 saat; son satırdakiler de aynı genişlikte kalsın.
  slot: { flexBasis: '22%', flexGrow: 1, maxWidth: '24%', paddingHorizontal: 0 },
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
