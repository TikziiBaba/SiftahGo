import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OptionSheet, SelectField } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Field, SectionTitle, styles, SwitchRow, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, categoryLabel, CITIES, RESERVED_SLUGS, SITE_DOMAIN } from '@/lib/constants';
import { errorMessage, slugify, slugInput } from '@/lib/format';
import { supabase } from '@/lib/supabase';
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
    is_published: business.is_published,
  });
  const [picker, setPicker] = useState<'category' | 'city' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await refresh();
    toast('Bilgiler kaydedildi.');
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

        <Card style={{ padding: 0, marginTop: 8 }}>
          <SwitchRow
            title="Randevuları otomatik onayla"
            description="Kapalıysa her randevuyu sizin onaylamanız gerekir."
            value={form.auto_confirm}
            onValueChange={(auto_confirm) => set({ auto_confirm })}
          />
          <View style={{ height: 1, backgroundColor: colors.line }} />
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
        <Button title="Kaydet" size="lg" onPress={save} loading={busy} />
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
