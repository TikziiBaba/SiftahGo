import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DynamicButton } from '@/components/dynamic-button';
import { OptionSheet, SelectField } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Field, SectionTitle, styles, SwitchRow, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, categoryLabel, CITIES, CONFIRM_MODES, confirmMode, RESERVED_SLUGS, SITE_DOMAIN } from '@/lib/constants';
import { errorMessage, slugify, slugInput } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';
import type { Business } from '@/lib/types';

// Web ile aynı seçenekler (web/src/app/panel/ayarlar/page.tsx)
const SLOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const NOTICE_OPTIONS = [
  [0, 'Hemen'],
  [30, '30 dk önce'],
  [60, '1 saat önce'],
  [120, '2 saat önce'],
  [240, '4 saat önce'],
  [720, '12 saat önce'],
  [1440, '1 gün önce'],
] as const;
const BOOKING_DAYS = [7, 14, 30, 60, 90, 180, 365];

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.id as string, label: c.label, icon: c.icon }));
const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

export default function InfoScreen() {
  const { business } = useAuth();
  return business ? <Info business={business} /> : null;
}

function Info({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    name: business.name,
    slug: business.slug,
    category: business.category,
    description: business.description,
    phone: business.phone,
    city: business.city,
    district: business.district,
    address: business.address,
    slot_minutes: business.slot_minutes,
    booking_days: business.booking_days,
    min_notice_minutes: business.min_notice_minutes,
    auto_confirm: business.auto_confirm,
    auto_confirm_known_only: business.auto_confirm_known_only,
    is_published: business.is_published,
  });
  const [picker, setPicker] = useState<'category' | 'city' | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [error, setError] = useState('');
  const located = business.latitude != null && business.longitude != null;
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setError('');
  };
  const bookingDays = BOOKING_DAYS.includes(form.booking_days) ? BOOKING_DAYS : [...BOOKING_DAYS, form.booking_days].sort((a, b) => a - b);

  async function save() {
    const slug = slugify(form.slug);
    if (!form.name.trim()) return setError('İşletme adını yazın.');
    if (slug.length < 3 || RESERVED_SLUGS.includes(slug)) return setError('Lütfen en az 3 karakterlik farklı bir sayfa adresi seçin.');
    setBusy(true);
    const { error } = await supabase
      .from('businesses')
      .update({ ...form, slug, name: form.name.trim(), description: form.description.trim() })
      .eq('id', business.id);
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    await refresh();
    setBusy(false);
    // Başarı düğmede görünür ("Kaydedildi"), biraz sonra düğme eski haline döner.
    haptic.success();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Keşfet "Yakınımda" için telefonun şu anki konumu kaydedilir (clear: konumu kaldırır).
  async function saveLocation(clear = false) {
    setLocBusy(true);
    setError('');
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (!clear) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('izin yok');
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latitude = Number(p.coords.latitude.toFixed(6));
        longitude = Number(p.coords.longitude.toFixed(6));
      } catch {
        setLocBusy(false);
        return setError('Konum alınamadı. Konum iznini açıp tekrar deneyin.');
      }
    }
    const { error } = await supabase.from('businesses').update({ latitude, longitude }).eq('id', business.id);
    setLocBusy(false);
    if (error) return setError(errorMessage(error));
    await refresh();
    toast(clear ? 'Konum kaldırıldı.' : 'Konum kaydedildi.');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
        <SectionTitle title="Genel" />
        <Field label="İşletme adı" icon="storefront-outline" value={form.name} onChangeText={(name) => set({ name })} />
        <Field
          label="Sayfa adresi"
          icon="link-outline"
          value={form.slug}
          onChangeText={(v) => set({ slug: slugInput(v) })}
          autoCapitalize="none"
          autoCorrect={false}
          hint={`${SITE_DOMAIN}/${slugify(form.slug)}`}
        />
        <SelectField label="Kategori" icon="grid-outline" value={categoryLabel(form.category)} onPress={() => setPicker('category')} />
        <Field label="Telefon" icon="call-outline" value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" placeholder="0212 xxx xx xx" />
        <Field
          label="Hakkında"
          value={form.description}
          onChangeText={(description) => set({ description })}
          placeholder="İşletmenizi birkaç cümleyle tanıtın."
          multiline
          maxLength={1000}
        />

        <SectionTitle title="Konum" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SelectField label="Şehir" icon="location-outline" value={form.city || null} onPress={() => setPicker('city')} style={{ flex: 1 }} />
          <Field label="İlçe" value={form.district} onChangeText={(district) => set({ district })} containerStyle={{ flex: 1 }} />
        </View>
        <Field label="Adres" icon="map-outline" value={form.address} onChangeText={(address) => set({ address })} placeholder="Mahalle, cadde, no" />
        {/* Ek dosya henüz çalıştırılmadıysa (konum sütunları yoksa) gizli kalır. */}
        {'latitude' in business && (
          <Card style={{ gap: 10 }}>
            <View style={[styles.rowCenter, { gap: 10 }]}>
              <Ionicons name={located ? 'navigate' : 'navigate-outline'} size={18} color={colors.brand300} />
              <Text tone={located ? 'default' : 'muted'} style={{ flex: 1 }}>
                {located ? 'Konum kayıtlı: Keşfet\'te "Yakınımda" aramasında görünürsünüz.' : 'Konum girilmedi: "Yakınımda" aramasında görünmezsiniz.'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Bulunduğum yeri kaydet" icon="locate-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => saveLocation()} loading={locBusy} />
              {located && <Button title="Kaldır" variant="dangerGhost" size="sm" onPress={() => saveLocation(true)} />}
            </View>
            <Text variant="caption" tone="muted">
              İşletmenizdeyken dokunun; telefonun konumu kaydedilir.
            </Text>
          </Card>
        )}

        <SectionTitle title="Randevu kuralları" />
        <Text variant="label" tone="secondary">
          Saat aralığı
        </Text>
        <View style={styles.wrap}>
          {SLOT_OPTIONS.map((m) => (
            <Chip key={m} label={`${m} dk`} selected={form.slot_minutes === m} onPress={() => set({ slot_minutes: m })} />
          ))}
        </View>
        <Text variant="label" tone="secondary" style={{ marginTop: 4 }}>
          En erken randevu
        </Text>
        <View style={styles.wrap}>
          {NOTICE_OPTIONS.map(([m, label]) => (
            <Chip key={m} label={label} selected={form.min_notice_minutes === m} onPress={() => set({ min_notice_minutes: m })} />
          ))}
        </View>
        <Text variant="label" tone="secondary" style={{ marginTop: 4 }}>
          En geç kaç gün sonrası
        </Text>
        <View style={styles.wrap}>
          {bookingDays.map((d) => (
            <Chip key={d} label={`${d} gün`} selected={form.booking_days === d} onPress={() => set({ booking_days: d })} />
          ))}
        </View>

        <Text variant="label" tone="secondary" style={{ marginTop: 4 }}>
          Randevu onayı
        </Text>
        <Card style={{ padding: 0 }}>
          {CONFIRM_MODES.map((m, i) => {
            const on = confirmMode(form).id === m.id;
            return (
              <View key={m.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.line }} />}
                <Pressable
                  onPress={() => {
                    haptic.select();
                    set({ auto_confirm: m.auto_confirm, auto_confirm_known_only: m.auto_confirm_known_only });
                  }}
                  accessibilityRole="radio"
                  aria-checked={on}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 58 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{m.label}</Text>
                    <Text variant="caption" tone="muted">
                      {m.hint}
                    </Text>
                  </View>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.brand300 : colors.ink3} />
                </Pressable>
              </View>
            );
          })}
        </Card>
        <Text variant="caption" tone="muted">
          Sık iptal eden veya randevusuna gelmeyen müşterilerin randevusu her durumda onayınıza düşer. Reddederken yazdığınız sebep müşteriye
          iletilir.
        </Text>

        <Card style={{ padding: 0, marginTop: 8 }}>
          <SwitchRow
            title="Sayfam yayında"
            description="Kapalıysa işletmeniz aramada görünmez ve randevu alınamaz."
            value={form.is_published}
            onValueChange={(is_published) => set({ is_published })}
          />
        </Card>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.lineStrong, gap: 10 }}>
        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <DynamicButton
          title={busy ? 'Kaydediliyor' : saved ? 'Kaydedildi' : 'Kaydet'}
          icon={saved && !busy ? 'checkmark' : undefined}
          loading={busy}
          onPress={save}
          style={{ alignSelf: 'center' }}
        />
      </View>

      <OptionSheet
        visible={picker === 'category'}
        onClose={() => setPicker(null)}
        title="Kategori"
        options={CATEGORY_OPTIONS}
        value={form.category}
        onSelect={(category) => set({ category })}
      />
      <OptionSheet visible={picker === 'city'} onClose={() => setPicker(null)} title="Şehir" options={CITY_OPTIONS} value={form.city} onSelect={(city) => set({ city })} searchable />
    </KeyboardAvoidingView>
  );
}
