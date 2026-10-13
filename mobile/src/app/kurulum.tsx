import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glow, Wordmark } from '@/components/brand';
import { OptionSheet, SelectField } from '@/components/pickers';
import { Banner, Button, Field, SectionTitle, styles, Text } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { CATEGORIES, CITIES, RESERVED_SLUGS, SITE_DOMAIN } from '@/lib/constants';
import { errorMessage, slugify, slugInput } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

/** İşletme hesabı açıldıktan sonra işletmenin oluşturulduğu ilk ekran (web: panel/kurulum). */
export default function SetupScreen() {
  const { session, profile, refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ name: '', slug: '', category: 'berber', city: '', phone: profile?.phone ?? '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [referral, setReferral] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const slug = slugTouched ? form.slug : slugify(form.name);
  const finalSlug = slugify(slug);

  async function submit() {
    if (!session) return;
    if (!form.name.trim()) return setError('İşletmenizin adını yazın.');
    if (finalSlug.length < 3 || RESERVED_SLUGS.includes(finalSlug)) return setError('Lütfen en az 3 karakterlik farklı bir sayfa adresi seçin.');
    if (!form.city) return setError('Şehrinizi seçin.');
    setBusy(true);
    setError('');
    const { error } = await supabase.from('businesses').insert({
      owner_id: session.user.id,
      name: form.name.trim(),
      slug: finalSlug,
      category: form.category,
      city: form.city,
      phone: form.phone.trim(),
    });
    if (error) {
      setBusy(false);
      haptic.error();
      return setError(errorMessage(error));
    }
    // Kod geçersizse kurulum yine biter; kod sonra Abonelik ekranından girilebilir.
    if (referral.trim()) await supabase.rpc('apply_referral', { p_code: referral });
    haptic.success();
    // İşletme yüklenince ekran kendiliğinden panele geçer.
    await refresh();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Glow height={420} opacity={0.24} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark />
          <Button title="Çıkış" variant="ghost" size="sm" onPress={() => signOut()} />
        </View>
        <View style={{ gap: 6, marginVertical: 8 }}>
          <Text variant="display">İşletmenizi oluşturalım</Text>
          <Text tone="muted">Bu bilgileri daha sonra İşletmem › İşletme bilgileri’nden değiştirebilirsiniz.</Text>
        </View>

        <Field label="İşletme adı" icon="storefront-outline" placeholder="Örn. Usta Berber" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
        <Field
          label="Sayfa adresi"
          icon="link-outline"
          value={slug}
          onChangeText={(v) => {
            setSlugTouched(true);
            setForm({ ...form, slug: slugInput(v) });
          }}
          autoCapitalize="none"
          autoCorrect={false}
          hint={`${SITE_DOMAIN}/${finalSlug || 'isletmeniz'}`}
        />

        <SectionTitle title="Kategori" />
        <View style={s.grid}>
          {CATEGORIES.map((c) => {
            const on = form.category === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  haptic.select();
                  setForm({ ...form, category: c.id });
                }}
                accessibilityRole="radio"
                aria-checked={on}
                style={[s.tile, on && s.tileOn]}>
                <Ionicons name={c.icon} size={22} color={on ? colors.brand300 : colors.ink3} />
                <Text variant="caption" tone={on ? 'default' : 'secondary'} style={{ textAlign: 'center' }} numberOfLines={2}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle title="İletişim" />
        <SelectField label="Şehir" icon="location-outline" value={form.city || null} onPress={() => setCityOpen(true)} />
        <Field label="İşletme telefonu" icon="call-outline" placeholder="0212 xxx xx xx" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" />
        <Field
          label="Davet kodu (isteğe bağlı)"
          icon="gift-outline"
          placeholder="Sizi davet eden işletmenin kodu"
          value={referral}
          onChangeText={setReferral}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          hint="İlk ödemenizde hem size hem davet edene 1 ay hediye."
        />

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title="İşletmeyi oluştur" icon="arrow-forward" size="lg" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
      </ScrollView>
      <OptionSheet visible={cityOpen} onClose={() => setCityOpen(false)} title="Şehir seçin" options={CITY_OPTIONS} value={form.city} onSelect={(city) => setForm({ ...form, city })} searchable />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31.5%',
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tileOn: { borderColor: colors.brandRing, backgroundColor: colors.brandSoft },
});
