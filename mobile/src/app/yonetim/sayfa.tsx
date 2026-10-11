import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/toast';
import { Badge, Banner, Button, Card, Field, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSubscribed, type IconName } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePlan } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { ACCENTS, colors } from '@/lib/theme';
import type { Business } from '@/lib/types';

// web/src/components/page-appearance.tsx ile aynı kurallar
/** "@ad", "instagram.com/ad/" gibi girişlerden yalnızca kullanıcı adını alır. */
function instagramName(v: string) {
  return v
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
}

function websiteUrl(v: string) {
  const t = v.trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
}

export default function PageScreen() {
  const { business } = useAuth();
  return business ? <Appearance business={business} /> : null;
}

function Appearance({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const plan = usePlan(business.plan_id);
  const has = (f: string) => !!plan && isSubscribed(business) && plan.features.includes(f);
  const anyOpen = has('announcement') || has('links') || has('theme');
  const [form, setForm] = useState({
    announcement: business.announcement ?? '',
    whatsapp: business.whatsapp ?? '',
    instagram: business.instagram ?? '',
    website: business.website ?? '',
    accent: business.accent ?? 'turkuaz',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setError('');
  };

  async function save() {
    const patch = { ...form, announcement: form.announcement.trim(), instagram: instagramName(form.instagram), website: websiteUrl(form.website) };
    setBusy(true);
    const { error } = await supabase.from('businesses').update(patch).eq('id', business.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setForm(patch);
    await refresh();
    toast('Sayfa görünümü kaydedildi.');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
        <Text tone="muted">Paketiniz yükseldikçe sayfanızı daha çok kişiselleştirebilirsiniz.</Text>

        <Part icon="megaphone-outline" title="Duyuru bandı" plan="Esnaf" locked={!has('announcement')} text="Sayfanızın üstünde öne çıkar: tatil günleri, kampanyalar, yeni hizmetler.">
          <Field
            value={form.announcement}
            onChangeText={(announcement) => set({ announcement })}
            placeholder="Örn. Bayramda da açığız! Salı günleri %20 indirim."
            multiline
            maxLength={160}
            accessibilityLabel="Duyuru"
            hint={`${form.announcement.length}/160 · Boş bırakırsanız görünmez.`}
          />
        </Part>

        <Part icon="link-outline" title="Kısayollar" plan="Esnaf" locked={!has('links')} text="Müşteriniz tek dokunuşla WhatsApp'tan yazsın, Instagram hesabınıza ve sitenize gitsin. Boş bıraktıklarınız görünmez.">
          <Field
            label="WhatsApp numarası"
            icon="logo-whatsapp"
            value={form.whatsapp}
            onChangeText={(v) => set({ whatsapp: v.replace(/[^0-9+ ()-]/g, '') })}
            keyboardType="phone-pad"
            maxLength={20}
            placeholder="05xx xxx xx xx"
          />
          {business.phone && form.whatsapp !== business.phone ? (
            <Pressable onPress={() => set({ whatsapp: business.phone })} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: -4 }}>
              <Text variant="label" tone="brand">
                Telefon numaramı kullan
              </Text>
            </Pressable>
          ) : null}
          <Field
            label="Instagram kullanıcı adı"
            icon="logo-instagram"
            value={form.instagram}
            onChangeText={(instagram) => set({ instagram })}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={60}
            placeholder="isletmeniz"
          />
          <Field
            label="Web sitesi"
            icon="globe-outline"
            value={form.website}
            onChangeText={(website) => set({ website })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={200}
            placeholder="https://"
          />
        </Part>

        <Part icon="color-palette-outline" title="Sayfa rengi" plan="Pro" locked={!has('theme')} text="Kapak, düğmeler ve vurgular bu renge bürünür. Renkler koyu temada okunaklı olacak şekilde seçildi.">
          <View style={s.swatches} accessibilityRole="radiogroup" accessibilityLabel="Sayfa rengi">
            {ACCENTS.map((a) => {
              const on = form.accent === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    haptic.select();
                    set({ accent: a.id });
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={a.label}
                  aria-checked={on}
                  style={({ pressed }) => [s.swatch, pressed && { opacity: 0.7 }]}>
                  <View style={[s.swatchDot, { backgroundColor: a.base }, on && { borderColor: colors.ink }]}>
                    {on && <Ionicons name="checkmark" size={18} color={a.ink} />}
                  </View>
                  <Text variant="caption" tone={on ? 'default' : 'muted'}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Part>

        <Button
          title="Sayfamı gör"
          variant="ghost"
          icon="open-outline"
          onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: business.slug } })}
        />
      </ScrollView>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
        <Button title="Kaydet" size="lg" onPress={save} loading={busy} disabled={!anyOpen} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Part({ icon, title, text, plan, locked, children }: { icon: IconName; title: string; text: string; plan: string; locked: boolean; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={s.partIcon}>
          <Ionicons name={icon} size={18} color={colors.brand300} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="bodyStrong">{title}</Text>
            {locked && (
              <Pressable onPress={() => router.push('/yonetim/abonelik')} accessibilityRole="button" accessibilityLabel={`${plan} paketinde, paketleri gör`}>
                <Badge label={`${plan} paketinde`} icon="lock-closed" fg={colors.gold} bg={colors.goldTint} />
              </Pressable>
            )}
          </View>
          <Text variant="caption" tone="muted">
            {text}
          </Text>
        </View>
      </View>
      {/* Kilitliyken alanlar görünür ama düzenlenemez; ne kazanacağını görsün. */}
      <View style={[{ gap: 12 }, locked && { opacity: 0.45, pointerEvents: 'none' }]} aria-disabled={locked}>
        {children}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  partIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  swatch: { width: 72, alignItems: 'center', gap: 6, paddingVertical: 4 },
  swatchDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
