import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Glow, LogoMark, Wordmark } from '@/components/brand';
import { DynamicButton } from '@/components/dynamic-button';
import { Float, GridFlow, Reveal } from '@/components/motion';
import { Button, Text } from '@/components/ui';
import { finishIntro } from '@/lib/intro';
import { alpha, colors, radius, shadows } from '@/lib/theme';

// Metinler web'deki tanıtımla aynı (web/src/components/auth-pitch.tsx). Üst başlıklar büyük harf yazılı:
// büyük harfe çevirme Türkçe "i"yi bilmiyor.
const PAGES = [
  {
    eyebrow: 'MÜŞTERİLER İÇİN',
    title: 'Sıra beklemeden,',
    accent: 'saatini seç.',
    text: 'Boş saatleri görün, randevunuzu saniyeler içinde alın.',
    perks: ['Ücretsiz randevu', 'Aramak, beklemek yok'],
    Art: SlotsArt,
  },
  {
    eyebrow: 'HATIRLATMA',
    title: 'Unutmak yok,',
    accent: 'ertelemek kolay.',
    text: 'Randevunuzdan önce hatırlatma gelir. Planınız değişirse saatini değiştirin ya da iptal edin.',
    perks: [],
    Art: ReminderArt,
  },
  {
    eyebrow: 'ESNAF İÇİN',
    title: 'Randevular düzende,',
    accent: 'siftah sabahtan.',
    text: 'Müşteriniz bağlantıdan saatini seçer, siz işinize bakarsınız.',
    perks: ['7 gün ücretsiz', '1 dakikada kurulum', 'Taahhüt yok'],
    Art: AgendaArt,
  },
];

const CLAMP = Extrapolation.CLAMP;

/** İlk açılışta bir kez görünen tanıtım; ardından kayıt ya da giriş açılır. */
export default function IntroScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const x = useScrollOffset(ref);
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;

  useAnimatedReaction(
    () => Math.round(x.get() / width),
    (p, prev) => {
      if (p !== prev) scheduleOnRN(setPage, p);
    },
    [width],
  );

  const goTo = (p: number) => ref.current?.scrollTo({ x: p * width, animated: true });

  // Önce hedefe geçilir, sonra tanıtım kapanır (koruma kalkınca bu ekran yığından düşer).
  function leave(to: '/giris' | '/kayit') {
    router.replace(to);
    finishIntro();
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.floor, { top: insets.top + 64 }]}>
        <GridFlow height={320} />
      </View>
      {/* Işık ızgaranın üstünde: ızgaranın solan üst kenarı ışığı kesmesin. */}
      <Glow height={480} opacity={0.26} />

      <View style={s.head}>
        <Wordmark size={28} />
        {!last && (
          <Pressable onPress={() => goTo(PAGES.length - 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Tanıtımı geç">
            <Text variant="label" tone="secondary">
              Geç
            </Text>
          </Pressable>
        )}
      </View>

      <Animated.ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16} style={{ flex: 1 }}>
        {PAGES.map((p, i) => (
          <Page key={p.eyebrow} page={p} index={i} x={x} width={width} />
        ))}
      </Animated.ScrollView>

      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={s.dots} aria-hidden>
          {PAGES.map((p, i) => (
            <Dot key={p.eyebrow} index={i} x={x} width={width} />
          ))}
        </View>
        <DynamicButton title={last ? 'Hesap oluştur' : 'İleri'} onPress={() => (last ? leave('/kayit') : goTo(page + 1))} style={{ alignSelf: 'stretch' }} />
        <Button title="Hesabım var, giriş yap" variant="ghost" onPress={() => leave('/giris')} />
      </View>
    </View>
  );
}

function Page({ page, index, x, width }: { page: (typeof PAGES)[number]; index: number; x: SharedValue<number>; width: number }) {
  // p: sayfanın ekrandaki yeri (-1 solda, 0 ortada, 1 sağda). Görsel sayfadan yavaş kayar (derinlik), uzaklaştıkça solar.
  const art = useAnimatedStyle(() => {
    const p = index - x.get() / width;
    return {
      opacity: interpolate(Math.abs(p), [0, 0.9], [1, 0], CLAMP),
      transform: [{ translateX: -p * width * 0.45 }, { scale: interpolate(Math.abs(p), [0, 1], [1, 0.88], CLAMP) }],
    };
  });
  const copy = useAnimatedStyle(() => {
    const p = index - x.get() / width;
    return { opacity: interpolate(Math.abs(p), [0, 0.7], [1, 0], CLAMP), transform: [{ translateX: -p * width * 0.15 }] };
  });
  const { Art } = page;
  return (
    <View style={{ width, flex: 1 }}>
      <Animated.View style={[s.artArea, art]}>
        <Reveal>
          <Art />
        </Reveal>
      </Animated.View>
      <Animated.View style={[s.copy, copy]}>
        <Reveal index={1}>
          <Text variant="overline" tone="brand">
            {page.eyebrow}
          </Text>
        </Reveal>
        <Reveal index={2}>
          <Text variant="display">
            {page.title}
            {'\n'}
            <Text variant="display" tone="brand">
              {page.accent}
            </Text>
          </Text>
        </Reveal>
        <Reveal index={3} style={{ gap: 12 }}>
          <Text tone="muted">{page.text}</Text>
          {page.perks.length ? (
            <View style={s.perks}>
              {page.perks.map((t) => (
                <View key={t} style={s.perk}>
                  <Ionicons name="checkmark" size={15} color={colors.brand300} />
                  <Text variant="label" tone="secondary">
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Reveal>
      </Animated.View>
    </View>
  );
}

function Dot({ index, x, width }: { index: number; x: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(index - x.get() / width);
    return { width: interpolate(d, [0, 1], [24, 8], CLAMP), opacity: interpolate(d, [0, 1], [1, 0.3], CLAMP) };
  });
  return <Animated.View style={[s.dot, style]} />;
}

// Tanıtım görselleri: uygulamadaki ekranların küçük örnekleri, hafifçe yüzerek.

const SLOTS = ['10:00', '10:30', '11:00', '11:30', '13:00', '14:30'];

function SlotsArt() {
  return (
    <View style={s.art}>
      <Float distance={6}>
        <View style={[s.panel, { width: 268 }]}>
          <View style={s.row}>
            <View style={s.avatar}>
              <Text variant="label" tone="brand">
                BA
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Berber Ahmet</Text>
              <Text variant="caption" tone="muted">
                Bugün · 5 boş saat
              </Text>
            </View>
          </View>
          <View style={s.slots}>
            {SLOTS.map((t) => {
              const on = t === '11:00';
              return (
                <View key={t} style={[s.slot, on && s.slotOn]}>
                  <Text variant="label" style={{ color: on ? colors.brandInk : colors.ink2, fontVariant: ['tabular-nums'] }}>
                    {t}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </Float>
      <Float delay={900} distance={10} style={s.floatBottom}>
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text variant="label">Randevunuz alındı</Text>
        </View>
      </Float>
    </View>
  );
}

function ReminderArt() {
  return (
    <View style={s.art}>
      <View style={[s.panel, s.behind]} />
      <Float distance={6}>
        <View style={[s.panel, { width: 280, gap: 8 }]}>
          <View style={s.row}>
            <LogoMark size={26} />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              SiftahGo
            </Text>
            <Text variant="caption" tone="muted">
              şimdi
            </Text>
          </View>
          <Text variant="bodyStrong">Yarın 11:30 · Saç kesimi</Text>
          <Text variant="caption" tone="secondary">
            Berber Ahmet’te randevunuz var. Görüşmek üzere!
          </Text>
        </View>
      </Float>
      <Float delay={700} distance={9} style={s.floatBottom}>
        <View style={s.row}>
          <View style={s.pill}>
            <Ionicons name="time-outline" size={15} color={colors.ink} />
            <Text variant="label">Saati değiştir</Text>
          </View>
          <View style={[s.pill, { backgroundColor: colors.dangerTint, borderColor: colors.dangerLine }]}>
            <Ionicons name="close" size={15} color={colors.danger} />
            <Text variant="label" tone="danger">
              İptal
            </Text>
          </View>
        </View>
      </Float>
    </View>
  );
}

const AGENDA = [
  { time: '09:30', name: 'Ayşe K.', service: 'Fön', color: colors.success },
  { time: '11:00', name: 'Mehmet T.', service: 'Saç + sakal', color: colors.brand },
  { time: '14:00', name: 'Zeynep A.', service: 'Manikür', color: colors.gold },
];

function AgendaArt() {
  return (
    <View style={s.art}>
      <Float distance={6}>
        <View style={[s.panel, { width: 280, gap: 10 }]}>
          <View style={s.row}>
            <Text variant="overline" tone="muted" style={{ flex: 1 }}>
              Bugün · 8 randevu
            </Text>
            <Text variant="label" tone="gold" style={{ fontVariant: ['tabular-nums'] }}>
              ₺3.250
            </Text>
          </View>
          {AGENDA.map((a) => (
            <View key={a.time} style={s.row}>
              <Text variant="label" tone="muted" style={{ width: 42, fontVariant: ['tabular-nums'] }}>
                {a.time}
              </Text>
              <View style={[s.agendaItem, { borderLeftColor: a.color }]}>
                <Text variant="label">{a.name}</Text>
                <Text variant="caption" tone="muted">
                  {a.service}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Float>
      <Float delay={800} distance={10} style={s.floatTop}>
        <View style={[s.toast, { borderColor: alpha(colors.gold, 0.3) }]}>
          <View style={s.goldDot} />
          <Text variant="label">Siftah! Yeni randevu</Text>
        </View>
      </Float>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  floor: { position: 'absolute', left: 0, right: 0, height: 320 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 52 },
  artArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  copy: { paddingHorizontal: 24, paddingBottom: 8, gap: 10 },
  perks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { paddingHorizontal: 20, paddingTop: 16, gap: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 14 },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.brand },

  art: { width: 320, height: 270, alignItems: 'center', justifyContent: 'center' },
  panel: {
    padding: 14,
    gap: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopColor: colors.edge,
    boxShadow: shadows.float,
  },
  behind: { position: 'absolute', top: 34, width: 240, height: 110, opacity: 0.45, transform: [{ scale: 0.94 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTint,
    borderWidth: 1,
    borderColor: colors.brandLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: 72,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white04,
  },
  slotOn: { backgroundColor: colors.brand, borderColor: colors.brand, boxShadow: shadows.brandSm },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    boxShadow: shadows.float,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  floatBottom: { position: 'absolute', bottom: 0, right: 8 },
  floatTop: { position: 'absolute', top: 0, right: 0 },
  agendaItem: { flex: 1, paddingLeft: 10, paddingVertical: 4, borderLeftWidth: 3, borderRadius: 2 },
  goldDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, boxShadow: shadows.goldDot },
});
