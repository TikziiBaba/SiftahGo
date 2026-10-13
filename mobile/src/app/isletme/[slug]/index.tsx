import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { CalendarSheet, DayStrip } from '@/components/pickers';
import { Avatar, Badge, Button, Card, Chip, Empty, IconButton, Loading, SectionTitle, Skeleton, styles, Text } from '@/components/ui';
import { AccentProvider, useAccent } from '@/lib/accent';
import { useAuth } from '@/lib/auth';
import { categoryIcon, categoryLabel, isSubscribed, WEB_URL, WEEKDAYS, type IconName } from '@/lib/constants';
import { addDays, errorMessage, formatDate, formatDuration, formatPrice, formatTime, isoWeekday, mapsLink, todayStr, whatsappLink } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { accentOf, alpha, colors, radius } from '@/lib/theme';
import type { Business, Review, Service, Staff, StaffService, WorkingHour } from '@/lib/types';

type Data = { business: Business; services: Service[]; staff: Staff[]; links: StaffService[]; hours: WorkingHour[]; reviews: Review[]; features: string[] };

const COVER = 230;

export default function BusinessScreen() {
  // service/staff: "Tekrar al" ile gelindiğinde önceki randevunun hizmeti ve personeli seçili açılır.
  // day: bekleme listesi bildiriminden gelindiğinde o gün seçili açılır.
  const {
    slug,
    service: rebookService,
    staff: rebookStaff,
    day: notifyDay,
  } = useLocalSearchParams<{ slug: string; service?: string; staff?: string; day?: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [favorite, setFavorite] = useState(false);
  // Bekleme listesine yazıldığı günler
  const [waitDays, setWaitDays] = useState<string[]>([]);
  const [waitBusy, setWaitBusy] = useState(false);
  const [waitError, setWaitError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  // "Tekrar al" ile gelindiyse ekran bir kez gün/saat seçimine kaydırılır.
  const scrollToBooking = useRef(!!rebookService);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState('');
  const [day, setDay] = useState(todayStr);
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[] } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [allReviews, setAllReviews] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: business } = await supabase.from('businesses').select('*').eq('slug', slug).maybeSingle();
      if (!business) return setData(null);
      const [s, st, h, r, plan] = await Promise.all([
        supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('staff').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('working_hours').select('*').eq('business_id', business.id).order('weekday'),
        supabase.from('reviews').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('plans').select('features').eq('id', business.plan_id ?? '').maybeSingle(),
      ]);
      const staff = st.data ?? [];
      const { data: links } = staff.length
        ? await supabase.from('staff_services').select('*').in('staff_id', staff.map((x) => x.id))
        : { data: [] };
      setData({ business, services: s.data ?? [], staff, links: links ?? [], hours: h.data ?? [], reviews: r.data ?? [], features: plan.data?.features ?? [] });
      if (rebookService && (s.data ?? []).some((x) => x.id === rebookService)) {
        setServiceId(rebookService);
        const linkList = links ?? [];
        const offers = (p: Staff) =>
          !linkList.some((l) => l.staff_id === p.id) || linkList.some((l) => l.staff_id === p.id && l.service_id === rebookService);
        if (rebookStaff && staff.some((p) => p.id === rebookStaff && offers(p))) setStaffId(rebookStaff);
      }
      // Bildirimden gelinen gün açıksa o, değilse ilk açık gün seçili gelir (bugün kapalı olabilir).
      const open = (d: string) => (h.data ?? []).find((x) => x.weekday === isoWeekday(d))?.is_open ?? false;
      const bookable = Array.from({ length: Math.min(business.booking_days, 30) + 1 }, (_, i) => addDays(todayStr(), i));
      const chosen = bookable.find((d) => d === notifyDay && open(d)) ?? bookable.find(open);
      if (chosen) setDay(chosen);
    })();
  }, [slug, rebookService, rebookStaff, notifyDay]);

  useEffect(() => {
    if (!session || !data) return;
    let active = true;
    Promise.all([
      supabase.from('favorites').select('business_id').eq('business_id', data.business.id).maybeSingle(),
      supabase.from('waitlist').select('day').eq('business_id', data.business.id),
    ]).then(([{ data: row }, { data: waits }]) => {
      if (!active) return;
      setFavorite(!!row);
      setWaitDays((waits ?? []).map((w: { day: string }) => w.day));
    });
    return () => {
      active = false;
    };
  }, [session, data]);

  // Randevu ekranından dönüldüğünde (ör. saat dolmuşsa) boş saatleri tazele.
  useFocusEffect(
    useCallback(() => {
      setReload((n) => n + 1);
    }, []),
  );

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

  const isOpen = useCallback((d: string) => data?.hours.find((h) => h.weekday === isoWeekday(d))?.is_open ?? false, [data]);

  const days = useMemo(() => {
    if (!data) return [];
    const start = todayStr();
    return Array.from({ length: Math.min(data.business.booking_days, 30) + 1 }, (_, i) => {
      const d = addDays(start, i);
      return { day: d, disabled: !isOpen(d) };
    });
  }, [data, isOpen]);

  if (data === undefined) return <Loading full />;
  if (data === null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 56 }]}>
        <BackButton top={insets.top + 8} />
        <Empty icon="storefront-outline" title="İşletme bulunamadı" text="Bu işletme şu an online randevu almıyor veya adresi değişmiş olabilir.">
          <Button title="Keşfete dön" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </Empty>
      </View>
    );
  }

  const { business, services, hours, links, reviews } = data;
  const service = services.find((x) => x.id === serviceId);
  // Kaydı olmayan personel tüm hizmetleri verir.
  const staff = data.staff.filter(
    (p) => !links.some((l) => l.staff_id === p.id) || links.some((l) => l.staff_id === p.id && l.service_id === serviceId),
  );
  const location = [business.address, business.district, business.city].filter(Boolean).join(', ');
  const today = isoWeekday(todayStr());
  const lastDay = addDays(todayStr(), business.booking_days);

  // Paketteki özelliğe göre görünen özelleştirmeler; paket düşerse ayarlar saklanır ama gösterilmez.
  const features = isSubscribed(business) ? data.features : [];
  const accent = accentOf(features.includes('theme') ? business.accent : undefined);
  const announcement = features.includes('announcement') ? (business.announcement ?? '').trim() : '';
  const custom = features.includes('links');
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
    {
      icon: favorite ? 'heart' : 'heart-outline',
      label: favorite ? 'Favorilerde' : 'Favori',
      onPress: toggleFavorite,
    },
    {
      icon: 'share-social-outline',
      label: 'Paylaş',
      onPress: () => Share.share({ message: `${business.name} — online randevu: ${WEB_URL}/${business.slug}` }),
    },
  ];

  async function toggleFavorite() {
    if (!session) return router.push('/giris');
    const next = !favorite;
    setFavorite(next);
    const { error } = next
      ? await supabase.from('favorites').insert({ customer_id: session.user.id, business_id: business.id })
      : await supabase.from('favorites').delete().eq('business_id', business.id);
    if (error) setFavorite(!next);
  }

  async function joinWaitlist() {
    if (!session) return router.push('/giris');
    setWaitBusy(true);
    setWaitError('');
    const { error } = await supabase.rpc('join_waitlist', { p_business_id: business.id, p_day: day });
    setWaitBusy(false);
    if (error) return setWaitError(errorMessage(error));
    haptic.success();
    setWaitDays((d) => [...d, day]);
  }

  async function leaveWaitlist() {
    setWaitBusy(true);
    setWaitError('');
    const { error } = await supabase.from('waitlist').delete().eq('business_id', business.id).eq('day', day);
    setWaitBusy(false);
    if (error) return setWaitError(errorMessage(error));
    setWaitDays((d) => d.filter((x) => x !== day));
  }

  function selectService(id: string) {
    setServiceId(id === serviceId ? null : id);
    setStaffId('');
    setTime(null);
    // Seçili gün kapalıysa ilk açık güne geç.
    if (!isOpen(day)) {
      const first = days.find((d) => !d.disabled);
      if (first) setDay(first.day);
    }
  }

  function chooseDay(d: string) {
    setDay(d);
    setTime(null);
  }

  return (
    <AccentProvider value={accent}>
      <View style={styles.screen}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: service ? 150 : 48 }} keyboardShouldPersistTaps="handled">
          <Cover uri={business.cover_url} height={COVER + insets.top} />
          <View style={s.fade} />

          <View style={[styles.content, { marginTop: -56, paddingBottom: 0 }]} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
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

            <SectionTitle title="Hizmet seçin" />
            {services.length === 0 && <Text tone="muted">Bu işletme henüz hizmet eklememiş.</Text>}
            {services.map((x) => {
              const on = x.id === serviceId;
              return (
                <Card
                  key={x.id}
                  onPress={() => selectService(x.id)}
                  accessibilityLabel={x.name}
                  style={[s.service, on && { borderColor: alpha(accent.base, 0.4), backgroundColor: alpha(accent.base, 0.07) }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="bodyStrong">{x.name}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {formatDuration(x.duration_minutes)}
                      {x.description ? ` · ${x.description}` : ''}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                    {Number(x.price) > 0 ? formatPrice(x.price) : '—'}
                  </Text>
                  <View style={[s.radio, on && { backgroundColor: accent.base, borderColor: accent.base }]}>
                    {on && <Ionicons name="checkmark" size={14} color={accent.ink} />}
                  </View>
                </Card>
              );
            })}

            {service && (
              <Animated.View
                entering={FadeInDown.duration(250)}
                style={{ gap: 12 }}
                onLayout={(e) => {
                  if (!scrollToBooking.current) return;
                  scrollToBooking.current = false;
                  scrollRef.current?.scrollTo({ y: bodyY.current + e.nativeEvent.layout.y - insets.top - 64, animated: true });
                }}>
                {staff.length > 1 && (
                  <>
                    <SectionTitle title="Personel" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
                      {[{ id: '', name: 'Farketmez' }, ...staff].map((p) => (
                        <Chip
                          key={p.id}
                          label={p.name}
                          icon={p.id ? undefined : 'people-outline'}
                          selected={staffId === p.id}
                          onPress={() => {
                            setStaffId(p.id);
                            setTime(null);
                          }}
                        />
                      ))}
                    </ScrollView>
                  </>
                )}

                <SectionTitle title="Gün" />
                <DayStrip days={days} value={day} onChange={chooseDay} onMore={business.booking_days > 30 ? () => setCalendarOpen(true) : undefined} />

                <SectionTitle title={`Saat · ${formatDate(day)}`} />
                {times === null ? (
                  <View style={styles.wrap}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <Skeleton key={i} height={38} style={s.slot} />
                    ))}
                  </View>
                ) : times.length === 0 ? (
                  <Card style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Ionicons name="moon-outline" size={22} color={colors.ink3} />
                      <Text tone="muted" style={{ flex: 1 }}>
                        {isOpen(day) ? 'Bu gün için boş saat kalmadı. Başka bir gün seçin.' : 'İşletme bu gün kapalı.'}
                      </Text>
                    </View>
                    {isOpen(day) &&
                      (waitDays.includes(day) ? (
                        <View style={[styles.rowCenter, { gap: 10 }]}>
                          <Ionicons name="notifications" size={18} color={accent.soft} />
                          <Text tone="secondary" style={{ flex: 1 }}>
                            Saat boşalırsa size haber vereceğiz.
                          </Text>
                          <Button title="Vazgeç" variant="ghost" size="sm" onPress={leaveWaitlist} loading={waitBusy} />
                        </View>
                      ) : (
                        <Button title="Boşalırsa haber ver" icon="notifications-outline" variant="secondary" onPress={joinWaitlist} loading={waitBusy} />
                      ))}
                    {waitError ? (
                      <Text variant="caption" tone="danger">
                        {waitError}
                      </Text>
                    ) : null}
                  </Card>
                ) : (
                  <View style={styles.wrap}>
                    {times.map((t) => (
                      <Chip key={t} label={formatTime(t)} solid selected={t === time} onPress={() => setTime(t)} style={s.slot} />
                    ))}
                  </View>
                )}
              </Animated.View>
            )}

            <SectionTitle title="Çalışma saatleri" />
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
              {location ? (
                <Pressable onPress={() => Linking.openURL(mapsLink(`${business.name} ${location}`))} style={s.address} accessibilityRole="link">
                  <Ionicons name="location-outline" size={18} color={accent.soft} />
                  <Text tone="secondary" style={{ flex: 1 }}>
                    {location}
                  </Text>
                  <Ionicons name="open-outline" size={16} color={colors.ink3} />
                </Pressable>
              ) : null}
            </Card>

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
                {(allReviews ? reviews : reviews.slice(0, 3)).map((r) => (
                  <Card key={r.id} style={{ gap: 8 }}>
                    <View style={styles.rowCenter}>
                      <Avatar name={r.customer_name} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong">{r.customer_name}</Text>
                        <Text variant="caption" tone="muted">
                          {formatDate(r.created_at, false)} · Randevulu müşteri
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

        <BackButton top={insets.top + 8} />

        {service && (
          <Animated.View entering={FadeInDown.duration(220)} style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {service.name}
              </Text>
              <Text variant="caption" tone={time ? 'brand' : 'muted'} numberOfLines={1}>
                {time ? `${formatDate(time)} · ${formatTime(time)}` : `${formatDuration(service.duration_minutes)} · saat seçin`}
                {Number(service.price) > 0 ? ` · ${formatPrice(service.price)}` : ''}
              </Text>
            </View>
            <Button
              title="Devam"
              icon="arrow-forward"
              disabled={!time}
              onPress={() =>
                router.push({
                  pathname: '/isletme/[slug]/randevu',
                  params: { slug: business.slug, service: service.id, staff: staffId, time: time! },
                })
              }
            />
          </Animated.View>
        )}

        <CalendarSheet
          key={day}
          visible={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          title="Gün seçin"
          value={day}
          min={todayStr()}
          max={lastDay}
          onSelect={chooseDay}
        />

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

/** Yuvarlak kısayol (Ara, WhatsApp, Yol tarifi...); rengi sayfa renginden. */
function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const accent = useAccent();
  return (
    <Pressable
      onPress={() => {
        haptic.press();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.shortcut, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}>
      <View style={[s.shortcutIcon, { backgroundColor: alpha(accent.base, 0.12), borderColor: alpha(accent.base, 0.25) }]}>
        <Ionicons name={icon} size={22} color={accent.soft} />
      </View>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function BackButton({ top }: { top: number }) {
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
  shortcuts: { gap: 4, paddingHorizontal: 12 },
  shortcut: { width: 72, alignItems: 'center', gap: 6, paddingVertical: 2 },
  shortcutIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  announcement: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  announcementIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  service: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Satırda 4 saat; son satırdakiler de aynı genişlikte kalsın.
  slot: { flexBasis: '22%', flexGrow: 1, maxWidth: '24%', paddingHorizontal: 0 },
  reply: { gap: 2, paddingLeft: 10, paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: colors.brandLine },
  address: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  photo: { width: 150, height: 150, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
  lightbox: { flex: 1, backgroundColor: colors.black },
});
