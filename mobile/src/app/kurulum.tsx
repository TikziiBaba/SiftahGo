import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glow, Wordmark } from '@/components/brand';
import { OptionSheet, SelectField } from '@/components/pickers';
import { Banner, Button, Field, Group, ListRow, SectionTitle, styles, Text } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { CATEGORIES, CITIES, RESERVED_SLUGS, SITE_DOMAIN } from '@/lib/constants';
import { errorMessage, formatDate, formatTime, slugify, slugInput } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Business } from '@/lib/types';

const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

/**
 * İşletme hesabı açıldıktan sonraki ilk ekran (web: panel/kurulum): başvuru formu, inceleniyor ekranı
 * ya da reddedilen başvuruyu düzeltip yeniden gönderme. Onaylanınca ekran kendiliğinden panele geçer.
 */
export default function SetupScreen() {
  const { business } = useAuth();
  return business?.approval_status === 'pending' ? <WaitingScreen business={business} /> : <ApplicationForm business={business} />;
}

function ApplicationForm({ business }: { business: Business | null }) {
  const { session, profile, refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    name: business?.name ?? '',
    slug: business?.slug ?? '',
    category: business?.category ?? 'berber',
    city: business?.city ?? '',
    district: business?.district ?? '',
    address: business?.address ?? '',
    phone: business?.phone ?? profile?.phone ?? '',
  });
  const [slugTouched, setSlugTouched] = useState(!!business);
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
    if (![form.district, form.address, form.phone].every((v) => v.trim())) return setError('İlçe, açık adres ve telefon zorunlu.');
    setBusy(true);
    setError('');
    const fields = {
      name: form.name.trim(),
      slug: finalSlug,
      category: form.category,
      city: form.city,
      district: form.district.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
    };
    // Reddedilen başvuru düzeltilip yeniden incelemeye gönderilir.
    const { error } = business
      ? await supabase.from('businesses').update({ ...fields, approval_status: 'pending' }).eq('id', business.id)
      : await supabase.from('businesses').insert({ owner_id: session.user.id, ...fields });
    if (error) {
      setBusy(false);
      haptic.error();
      return setError(errorMessage(error));
    }
    // Kod geçersizse kurulum yine biter; kod sonra Abonelik ekranından girilebilir.
    if (!business && referral.trim()) await supabase.rpc('apply_referral', { p_code: referral });
    haptic.success();
    // Başvuru yüklenince ekran inceleniyor görünümüne geçer.
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
          <Text variant="display">{business ? 'Başvurunuzu düzeltin' : 'İşletmenizi oluşturalım'}</Text>
          <Text tone="muted">Bilgileriniz yetkililerimizce kontrol edildikten sonra sayfanız yayına açılır ve 7 günlük ücretsiz Pro denemeniz başlar.</Text>
        </View>
        {business?.approval_status === 'rejected' ? (
          <Banner
            tone="danger"
            icon="alert-circle-outline"
            title="Başvurunuz onaylanmadı"
            text={[business.approval_note, 'Bilgileri düzeltip yeniden gönderin.'].filter(Boolean).join('\n')}
          />
        ) : null}

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
        <Field label="İlçe" icon="navigate-outline" placeholder="Örn. Kadıköy" value={form.district} onChangeText={(district) => setForm({ ...form, district })} />
        <Field
          label="Açık adres"
          icon="map-outline"
          placeholder="Mahalle, cadde/sokak, bina ve kapı no"
          value={form.address}
          onChangeText={(address) => setForm({ ...form, address })}
          maxLength={300}
          multiline
        />
        <Field
          label="İşletme telefonu"
          icon="call-outline"
          placeholder="0212 xxx xx xx"
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          keyboardType="phone-pad"
          hint="Başvurunuzu doğrulamak için bu numaradan size ulaşabiliriz."
        />
        {!business ? (
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
        ) : null}

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title={business ? 'Yeniden gönder' : 'Başvuruyu gönder'} icon="arrow-forward" size="lg" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
      </ScrollView>
      <OptionSheet visible={cityOpen} onClose={() => setCityOpen(false)} title="Şehir seçin" options={CITY_OPTIONS} value={form.city} onSelect={(city) => setForm({ ...form, city })} searchable />
    </KeyboardAvoidingView>
  );
}

function WaitingScreen({ business: b }: { business: Business }) {
  const { refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    await refresh();
    setBusy(false);
  }

  return (
    <View style={styles.screen}>
      <Glow height={420} opacity={0.24} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark />
          <Button title="Çıkış" variant="ghost" size="sm" onPress={() => signOut()} />
        </View>
        <View style={{ alignItems: 'center', gap: 10, marginVertical: 16 }}>
          <View style={s.waitIcon}>
            <Ionicons name="hourglass-outline" size={26} color={colors.warning} />
          </View>
          <Text variant="display" style={{ textAlign: 'center' }}>
            Başvurunuz inceleniyor
          </Text>
          <Text tone="muted" style={{ textAlign: 'center' }}>
            Yetkililerimiz bilgilerinizi kontrol ediyor; gerekirse sizi işletme telefonunuzdan arayabiliriz. Onaylanınca sayfanız yayına
            açılır ve 7 günlük ücretsiz Pro denemeniz başlar.
          </Text>
        </View>
        <Group>
          <ListRow icon="storefront-outline" title={b.name} subtitle={`${SITE_DOMAIN}/${b.slug}`} />
          <ListRow icon="location-outline" title={[b.address, b.district, b.city].filter(Boolean).join(', ') || '—'} subtitle="Adres" />
          <ListRow icon="call-outline" title={b.phone || '—'} subtitle="Telefon" />
          <ListRow icon="time-outline" title={`${formatDate(b.submitted_at)} ${formatTime(b.submitted_at)}`} subtitle="Başvuru" />
        </Group>
        <Button title="Durumu yenile" icon="refresh" variant="secondary" size="lg" onPress={check} loading={busy} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  waitIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningTint,
  },
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
