import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { OptionSheet, SelectField } from '@/components/pickers';
import { SaveBar } from '@/components/save-bar';
import { useToast } from '@/components/toast';
import { Button, Card, Field, SectionTitle, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, categoryLabel, CITIES, RESERVED_SLUGS, SITE_DOMAIN } from '@/lib/constants';
import { errorMessage, slugify, slugInput } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business } from '@/lib/types';

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.id as string, label: c.label, icon: c.icon }));
const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

export default function InfoScreen() {
  const { business } = useAuth();
  return business ? <Info business={business} /> : null;
}

/** Ad, sayfa adresi, kategori, iletişim ve konum. Randevu kuralları ayrı ekranda (kurallar.tsx). */
function Info({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    name: business.name,
    slug: business.slug,
    category: business.category,
    description: business.description,
    phone: business.phone,
    city: business.city,
    district: business.district,
    address: business.address,
  });
  const [picker, setPicker] = useState<'category' | 'city' | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [error, setError] = useState('');
  const located = business.latitude != null && business.longitude != null;
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== business[k]);
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setError('');
  };

  async function save() {
    const slug = slugify(form.slug);
    if (!form.name.trim()) {
      setError('İşletme adını yazın.');
      return false;
    }
    if (slug.length < 3 || RESERVED_SLUGS.includes(slug)) {
      setError('Lütfen en az 3 karakterlik farklı bir sayfa adresi seçin.');
      return false;
    }
    const row = { ...form, slug, name: form.name.trim(), description: form.description.trim() };
    const { error } = await supabase.from('businesses').update(row).eq('id', business.id);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    // Kaydedilen (kırpılmış) değerler formda da kalır; yoksa değişiklik varmış gibi görünür.
    setForm(row);
    await refresh();
    return true;
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
      </ScrollView>

      <SaveBar dirty={dirty} error={error} onSave={save} />

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
