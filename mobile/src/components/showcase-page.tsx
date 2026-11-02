import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { ShopCoupons } from '@/components/shop-coupons';
import { TopBar, useScrollY } from '@/components/top-bar';
import { Avatar, Badge, Banner, Card, IconButton, PressableScale, SectionTitle, styles, Text } from '@/components/ui';
import { AccentProvider, useAccent } from '@/lib/accent';
import { categoryIcon, categoryLabel, menuLabel, WEB_URL, WEEKDAYS, type IconName } from '@/lib/constants';
import { formatDate, formatPrice, isoWeekday, isOpenNow, mapsLink, todayStr, whatsappLink } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { accentOf, alpha, colors, radius } from '@/lib/theme';
import type { Business, MenuItem, Review, WorkingHour } from '@/lib/types';

const COVER = 230;

/**
 * Randevusuz (vitrin) işletmenin sayfası (web: components/showcase-page.tsx): kapak, ad ve açık/kapalı, kısayollar,
 * kuponlar, menü, fotoğraflar, yorumlar. Boş bölümün başlığı çıkmaz. Menü her açılışta okunur.
 */
export function ShowcasePage({
  business,
  reviews,
  hours,
  features,
  favorite,
  onToggleFavorite,
}: {
  business: Business;
  reviews: Review[];
  hours: WorkingHour[];
  /** Paketteki özellikler; abonelik bittiyse boş. */
  features: string[];
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { y, scroll } = useScrollY();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [allReviews, setAllReviews] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const location = [business.address, business.district, business.city].filter(Boolean).join(', ');
  const accent = accentOf(features.includes('theme') ? business.accent : undefined);
  const announcement = features.includes('announcement') ? (business.announcement ?? '').trim() : '';
  const custom = features.includes('links');
  const status = hours.length > 0 ? isOpenNow(hours) : null;
  const today = isoWeekday(todayStr());

  const shortcuts: { icon: IconName; label: string; onPress: () => void }[] = [
    ...(business.phone ? [{ icon: 'call-outline' as const, label: 'Ara', onPress: () => Linking.openURL(`tel:${business.phone}`) }] : []),
    ...(custom && business.whatsapp
      ? [{ icon: 'logo-whatsapp' as const, label: 'WhatsApp', onPress: () => Linking.openURL(whatsappLink(business.whatsapp, `Merhaba ${business.name}, `)) }]
      : []),
    ...(custom && business.instagram
      ? [{ icon: 'logo-instagram' as const, label: 'Instagram', onPress: () => Linking.openURL(`https://instagram.com/${business.instagram}`) }]
      : []),
    ...(location ? [{ icon: 'navigate-outline' as const, label: 'Yol tarifi', onPress: () => Linking.openURL(mapsLink(`${business.name} ${location}`)) }] : []),
    ...(custom && business.website ? [{ icon: 'globe-outline' as const, label: 'Web sitesi', onPress: () => Linking.openURL(business.website) }] : []),
    { icon: favorite ? 'heart' : 'heart-outline', label: favorite ? 'Favorilerde' : 'Favori', onPress: onToggleFavorite },
    { icon: 'share-social-outline', label: 'Paylaş', onPress: () => Share.share({ message: `${business.name}: ${WEB_URL}/${business.slug}` }) },
  ];

  return (
    <AccentProvider value={accent}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" {...scroll}>
          <Cover uri={business.cover_url} height={COVER + insets.top} />
          <View style={s.fade} />

          <View style={[styles.content, { marginTop: -56, paddingBottom: 0 }]}>
            <View style={s.logo}>
              <Logo business={business} size={84} />
            </View>
            <View style={{ gap: 6 }}>
              <Text variant="display">{business.name}</Text>
              <View style={[styles.rowCenter, { flexWrap: 'wrap' }]}>
                <Ionicons name={categoryIcon(business.category)} size={15} color={colors.ink3} />
                <Text tone="muted">
                  {categoryLabel(business.category)}
                  {business.district || business.city ? ` · ${[business.district, business.city].filter(Boolean).join(', ')}` : ''}
                </Text>
              </View>
              {business.rating_count > 0 ? (
                <View style={styles.rowCenter}>
                  <Ionicons name="star" size={15} color={colors.gold} />
                  <Text variant="bodyStrong" tone="gold">
                    {Number(business.rating_avg).toFixed(1)}
                  </Text>
                  <Text tone="muted">· {business.rating_count} değerlendirme</Text>
                </View>
              ) : (
                <Badge label="Yeni işletme" fg={accent.soft} bg={alpha(accent.base, 0.12)} icon="sparkles-outline" />
              )}
            </View>

            {status && (
              <View style={{ gap: 10 }}>
                <Pressable onPress={() => setHoursOpen(!hoursOpen)} accessibilityRole="button" accessibilityState={{ expanded: hoursOpen }} style={[styles.rowCenter, { gap: 8 }]}>
                  <View style={[s.dot, { backgroundColor: status.open ? colors.success : colors.ink3 }]} />
                  <Text variant="bodyStrong" tone={status.open ? 'success' : 'secondary'}>
                    {status.open ? 'Açık' : 'Kapalı'}
                  </Text>
                  {status.open && status.until ? <Text tone="muted">· {status.until}’e kadar</Text> : null}
                  <Ionicons name="time-outline" size={14} color={colors.ink3} />
                  <Text tone="muted">Saatler</Text>
                </Pressable>
                {hoursOpen && (
                  <Card style={{ gap: 10 }}>
                    {hours.map((h) => (
                      <View key={h.weekday} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant={h.weekday === today ? 'bodyStrong' : 'body'} tone="secondary" style={h.weekday === today && { color: accent.soft }}>
                          {WEEKDAYS[h.weekday - 1]}
                          {h.weekday === today ? ' · Bugün' : ''}
                        </Text>
                        <Text variant={h.weekday === today ? 'bodyStrong' : 'body'} tone={h.is_open ? 'default' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
                          {h.is_open ? `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}` : 'Kapalı'}
                        </Text>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shortcuts} style={{ marginHorizontal: -16, marginTop: 4 }}>
              {shortcuts.map((x) => (
                <Shortcut key={x.label} {...x} />
              ))}
            </ScrollView>

            {announcement ? (
              <View style={[s.announcement, { backgroundColor: alpha(accent.base, 0.1), borderColor: alpha(accent.base, 0.25) }]}>
                <View style={[s.announcementIcon, { backgroundColor: alpha(accent.base, 0.16) }]}>
                  <Ionicons name="megaphone-outline" size={18} color={accent.soft} />
                </View>
                <Text style={{ flex: 1 }}>{announcement}</Text>
              </View>
            ) : null}

            {business.description ? (
              <>
                <SectionTitle title="Hakkında" />
                <Pressable onPress={() => setAboutOpen(!aboutOpen)} accessibilityRole="button">
                  <Text tone="secondary" style={{ lineHeight: 22 }} numberOfLines={aboutOpen ? undefined : 3}>
                    {business.description}
                  </Text>
                  {business.description.length > 110 && (
                    <Text variant="label" style={{ marginTop: 4, color: accent.soft }}>
                      {aboutOpen ? 'Daha az' : 'Devamını gör'}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {business.is_suspended && <Banner tone="danger" icon="alert-circle-outline" text="Bu sayfa yönetici tarafından yayından kaldırıldı; sadece siz görebilirsiniz." />}
            {!business.is_published && <Banner tone="warning" icon="eye-off-outline" text="Bu sayfa şu an yayında değil; sadece siz görebilirsiniz. Ayarlardan yayına alabilirsiniz." />}

            {/* Kuponlar paketle gelir; paket düşerse gizlenir (web ile aynı). */}
            {features.includes('coupons') && <ShopCoupons showcase businessId={business.id} services={[]} />}

            <ShowcaseMenu businessId={business.id} label={menuLabel(business.category)} />

            {business.gallery.length > 0 && (
              <>
                <SectionTitle title="Fotoğraflar" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
                  {business.gallery.map((url) => (
                    <Pressable key={url} onPress={() => setPhoto(url)} accessibilityRole="imagebutton" accessibilityLabel="Fotoğrafı büyüt">
                      <Image source={url} style={s.photo} contentFit="cover" transition={150} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {reviews.length > 0 && (
              <>
                <SectionTitle
                  title={`Yorumlar · ${business.rating_count}`}
                  action={reviews.length > 3 ? (allReviews ? 'Daha az' : 'Tümü') : undefined}
                  onAction={() => setAllReviews(!allReviews)}
                />
                <Text variant="caption" tone="muted">
                  Yorumlar, kuponu kasada kullanan müşterilerden gelir.
                </Text>
                {(allReviews ? reviews : reviews.slice(0, 3)).map((r) => (
                  <Card key={r.id} style={{ gap: 8 }}>
                    <View style={styles.rowCenter}>
                      <Avatar name={r.customer_name} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong">{r.customer_name}</Text>
                        <Text variant="caption" tone="muted">
                          {formatDate(r.created_at, false)} · Kupon kullanan müşteri
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 1 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Ionicons key={i} name="star" size={13} color={i <= r.rating ? colors.gold : colors.surface3} />
                        ))}
                      </View>
                    </View>
                    {r.comment ? <Text tone="secondary">{r.comment}</Text> : null}
                    {r.reply ? (
                      <View style={s.reply}>
                        <Text variant="caption" style={{ color: accent.soft }}>
                          İşletmenin cevabı
                        </Text>
                        <Text tone="secondary">{r.reply}</Text>
                      </View>
                    ) : null}
                  </Card>
                ))}
              </>
            )}
          </View>
        </ScrollView>

        {/* İşletme adı kapağın altından kayıp geri düğmesinin arkasına girince çubukta görünür. */}
        <TopBar y={y} title={business.name} cover left={68} after={COVER + 8} />
        <BackButton top={insets.top + 8} />

        <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
          <View style={s.lightbox}>
            {photo && <Image source={photo} style={StyleSheet.absoluteFill} contentFit="contain" />}
            <IconButton icon="close" label="Kapat" onPress={() => setPhoto(null)} style={{ position: 'absolute', top: insets.top + 12, right: 16 }} />
          </View>
        </Modal>
      </View>
    </AccentProvider>
  );
}

/** Menü ya da ürün listesi: ürünler her açılışta okunur (bayat kalmasın). Ürün yoksa başlık da çıkmaz. Kategorisizler başlıksız ve en üstte. */
function ShowcaseMenu({ businessId, label }: { businessId: string; label: 'Menü' | 'Ürünler' }) {
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    supabase
      .from('menu_items')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')
      .then(({ data }) => setItems(((data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) }))));
  }, [businessId]);

  if (items.length === 0) return null;

  // Kategoriler ilk göründükleri sırayla; kategorisizler başlıksız ve en üstte.
  const groups = new Map<string, MenuItem[]>();
  for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0));

  return (
    <>
      <SectionTitle title={label} />
      {ordered.map(([category, list]) => (
        <View key={category || 'kategorisiz'} style={{ gap: 8 }}>
          {category ? (
            <Text variant="label" tone="secondary">
              {category}
            </Text>
          ) : null}
          <Card style={{ padding: 0 }}>
            {list.map((i, n) => (
              <View key={i.id} style={[s.item, n > 0 && s.itemBorder]}>
                {i.image_url ? <Image source={i.image_url} style={s.itemImage} contentFit="cover" transition={150} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{i.name}</Text>
                  {i.description ? (
                    <Text variant="caption" tone="muted">
                      {i.description}
                    </Text>
                  ) : null}
                </View>
                <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatPrice(i.price)}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

/** Yuvarlak kısayol (Ara, WhatsApp, Yol tarifi...); rengi sayfa renginden. */
export function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const accent = useAccent();
  return (
    <PressableScale
      onPress={() => {
        haptic.press();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      scale={0.9}
      style={s.shortcut}>
      <View style={[s.shortcutIcon, { backgroundColor: alpha(accent.base, 0.12), borderColor: alpha(accent.base, 0.25) }]}>
        <Ionicons name={icon} size={22} color={accent.soft} />
      </View>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function BackButton({ top }: { top: number }) {
  return (
    <IconButton
      icon="chevron-back"
      label="Geri"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={{ position: 'absolute', top, left: 16, backgroundColor: colors.bgGlass, borderColor: colors.lineStrong }}
    />
  );
}

const s = StyleSheet.create({
  fade: { height: 56, marginTop: -56, experimental_backgroundImage: `linear-gradient(to bottom, ${colors.bgClear}, ${colors.bg})` },
  logo: {
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 30,
    backgroundColor: colors.bg,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  shortcuts: { gap: 4, paddingHorizontal: 12 },
  shortcut: { width: 72, alignItems: 'center', gap: 6, paddingVertical: 2 },
  shortcutIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  announcement: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  announcementIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  itemImage: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surface2 },
  reply: { gap: 2, paddingLeft: 10, paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: colors.brandLine },
  photo: { width: 150, height: 150, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  lightbox: { flex: 1, backgroundColor: colors.black },
});
