import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Cover } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { SaveBar } from '@/components/save-bar';
import { Badge, Button, Card, Field, SectionTitle, styles, Text } from '@/components/ui';
import { AccentProvider } from '@/lib/accent';
import { useAuth } from '@/lib/auth';
import { categoryLabel, isSubscribed, type IconName } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePlan } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { accentOf, ACCENTS, alpha, colors, radius } from '@/lib/theme';
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

type Form = { announcement: string; whatsapp: string; instagram: string; website: string; accent: string };

function Appearance({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const plan = usePlan(business.plan_id);
  const has = (f: string) => !!plan && isSubscribed(business) && plan.features.includes(f);
  const anyOpen = has('announcement') || has('links') || has('theme');
  const stored: Form = {
    announcement: business.announcement ?? '',
    whatsapp: business.whatsapp ?? '',
    instagram: business.instagram ?? '',
    website: business.website ?? '',
    accent: business.accent ?? 'turkuaz',
  };
  const [form, setForm] = useState(stored);
  const [error, setError] = useState('');
  const dirty = anyOpen && (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== stored[k]);
  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setError('');
  };

  async function save() {
    const patch = { ...form, announcement: form.announcement.trim(), instagram: instagramName(form.instagram), website: websiteUrl(form.website) };
    const { error } = await supabase.from('businesses').update(patch).eq('id', business.id);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    setForm(patch);
    await refresh();
    return true;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Preview business={business} form={form} has={has} />
        <Button title="Logo ve kapak fotoğrafı" icon="images-outline" variant="secondary" size="sm" onPress={() => router.push('/yonetim/gorseller')} />
        <Text tone="muted">Paketiniz yükseldikçe sayfanızı daha çok kişiselleştirebilirsiniz.</Text>

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

        <Button
          title="Sayfamı gör"
          variant="ghost"
          icon="open-outline"
          onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: business.slug } })}
        />
      </ScrollView>

      <SaveBar dirty={dirty} error={error} onSave={save} />
    </KeyboardAvoidingView>
  );
}

/**
 * Müşterinin göreceği sayfa başının küçük kopyası: kaydetmeden önce renk, duyuru bandı ve kısayollar burada görünür.
 * İşletme sayfasıyla (isletme/[slug]/index.tsx) aynı kural: paketin açmadığı özellik sayfada da önizlemede de görünmez.
 */
function Preview({ business, form, has }: { business: Business; form: Form; has: (feature: string) => boolean }) {
  const accent = accentOf(has('theme') ? form.accent : undefined);
  const announcement = has('announcement') ? form.announcement.trim() : '';
  const links = has('links');
  const location = !!(business.address || business.district || business.city);
  const shortcuts: { icon: IconName; label: string }[] = [
    ...(business.phone ? [{ icon: 'call-outline' as const, label: 'Ara' }] : []),
    ...(links && form.whatsapp.trim() ? [{ icon: 'logo-whatsapp' as const, label: 'WhatsApp' }] : []),
    ...(links && form.instagram.trim() ? [{ icon: 'logo-instagram' as const, label: 'Instagram' }] : []),
    ...(location ? [{ icon: 'navigate-outline' as const, label: 'Yol tarifi' }] : []),
    ...(links && form.website.trim() ? [{ icon: 'globe-outline' as const, label: 'Web' }] : []),
    { icon: 'heart-outline', label: 'Favori' },
  ];
  return (
    <AccentProvider value={accent}>
      <SectionTitle title="Önizleme" />
      <View style={s.preview} accessible accessibilityLabel="Sayfanızın önizlemesi">
        <Cover uri={business.cover_url} height={92} />
        <View style={s.previewBody}>
          <View style={s.previewLogo}>
            <Logo business={business} size={52} />
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="heading" numberOfLines={1}>
              {business.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {categoryLabel(business.category)}
              {business.district || business.city ? ` · ${[business.district, business.city].filter(Boolean).join(', ')}` : ''}
            </Text>
          </View>
          <View style={s.previewShortcuts}>
            {shortcuts.slice(0, 6).map((x) => (
              <View key={x.label} style={s.previewShortcut}>
                <View style={[s.previewShortcutIcon, { backgroundColor: alpha(accent.base, 0.12), borderColor: alpha(accent.base, 0.25) }]}>
                  <Ionicons name={x.icon} size={16} color={accent.soft} />
                </View>
                <Text variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10 }}>
                  {x.label}
                </Text>
              </View>
            ))}
          </View>
          {announcement ? (
            <View style={[s.previewAnnouncement, { backgroundColor: alpha(accent.base, 0.1), borderColor: alpha(accent.base, 0.25) }]}>
              <Ionicons name="megaphone-outline" size={15} color={accent.soft} />
              <Text variant="caption" style={{ flex: 1 }} numberOfLines={2}>
                {announcement}
              </Text>
            </View>
          ) : null}
          <View style={[s.previewButton, { backgroundColor: accent.base }]}>
            <Text variant="label" style={{ color: accent.ink }}>
              Randevu al
            </Text>
          </View>
        </View>
      </View>
    </AccentProvider>
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
  preview: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bg },
  previewBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  previewLogo: { marginTop: -28, alignSelf: 'flex-start', padding: 3, borderRadius: 18, backgroundColor: colors.bg },
  previewShortcuts: { flexDirection: 'row', gap: 4 },
  previewShortcut: { width: 52, alignItems: 'center', gap: 4 },
  previewShortcutIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  previewAnnouncement: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md, borderWidth: 1 },
  previewButton: { height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
