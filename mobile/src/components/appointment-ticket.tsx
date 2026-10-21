import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useSvgId } from '@/components/brand';
import { Text } from '@/components/ui';
import { useAccent } from '@/lib/accent';
import { formatDate, formatDuration, formatPrice, formatTime } from '@/lib/format';
import { alpha, colors, fonts, radius } from '@/lib/theme';

const CORNER = 24;
const NOTCH = 12;
// Hafifçe eğik ve aşağıdan gelir, yerine otururken biraz taşar.
const SETTLE = { damping: 12, stiffness: 140, mass: 0.9 };

/**
 * Alınan randevu, delikli koçanlı bir bilet olarak. Üst parça sayfa renginde (useAccent), alt koçanda ayrıntılar;
 * birleşim yerinde iki yanda yarım daire çentik ve kesikli çizgi var.
 */
export function AppointmentTicket({
  businessName,
  serviceName,
  staffName,
  startsAt,
  durationMinutes,
  price,
  place,
  confirmed,
}: {
  businessName: string;
  serviceName: string;
  staffName?: string;
  startsAt: string;
  durationMinutes: number;
  price: number;
  place: string;
  confirmed: boolean;
}) {
  const accent = useAccent();
  const id = useSvgId();
  // withSpring "hareketi azalt" açıksa doğrudan yerinde başlar.
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withSpring(1, SETTLE));
  }, [t]);
  const enter = useAnimatedStyle(() => {
    const p = t.get();
    return {
      opacity: Math.min(1, p * 1.5),
      transform: [{ translateY: 28 * (1 - p) }, { rotate: `${-3 * (1 - p)}deg` }, { scale: 0.96 + 0.04 * p }],
    };
  });

  return (
    <Animated.View style={[s.ticket, { boxShadow: `0 24px 40px -18px ${alpha(accent.base, 0.45)}` }, enter]}>
      <Half
        notch="bottom"
        style={s.top}
        paint={(d) => (
          <>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={accent.soft} />
                <Stop offset="1" stopColor={accent.base} />
              </LinearGradient>
            </Defs>
            <Path d={d} fill={`url(#${id})`} />
          </>
        )}>
        <View style={s.topRow}>
          <Text variant="overline" style={{ color: accent.ink, opacity: 0.7, flex: 1 }} numberOfLines={1}>
            Randevunuz alındı
          </Text>
          <View style={s.chip}>
            <Ionicons name={confirmed ? 'checkmark-circle' : 'hourglass-outline'} size={13} color={accent.ink} />
            <Text variant="caption" style={{ color: accent.ink, fontFamily: fonts.semibold }}>
              {confirmed ? 'Onaylandı' : 'Onay bekliyor'}
            </Text>
          </View>
        </View>
        <Text variant="title" style={{ color: accent.ink, marginTop: 22 }}>
          {businessName}
        </Text>
        <Text variant="bodyStrong" style={{ color: accent.ink, opacity: 0.75, marginTop: 2 }}>
          {serviceName}
        </Text>
      </Half>
      <Half
        notch="top"
        style={s.stub}
        paint={(d, width) => (
          <>
            <Path d={d} fill={colors.surface2} />
            <Line x1={NOTCH + 8} x2={width - NOTCH - 8} y1={1} y2={1} stroke={colors.lineStrong} strokeWidth={2} strokeDasharray="6 6" />
          </>
        )}>
        <View style={s.grid}>
          <Field label="Saat" value={formatTime(startsAt)} big />
          {/* Büyük harfe çevirme Türkçe "i"yi bilmiyor; etiket hazır yazılı. */}
          <Field label="TARİH" value={formatDate(startsAt)} />
          <Field label="Süre" value={formatDuration(durationMinutes)} />
          <Field label="Ücret" value={price > 0 ? formatPrice(price) : '—'} />
          {staffName ? <Field label="Personel" value={staffName} /> : null}
          {place ? <Field label="Adres" value={place} wide /> : null}
        </View>
      </Half>
    </Animated.View>
  );
}

/** Bilet parçası: dış köşeler yuvarlak, birleşim kenarının iki ucunda yarım daire çentik. Zemin ölçülen boyuta çizilir. */
function Half({
  notch,
  paint,
  style,
  children,
}: {
  notch: 'top' | 'bottom';
  paint: (d: string, width: number) => React.ReactNode;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={style} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          {paint(halfPath(size.w, size.h, notch), size.w)}
        </Svg>
      )}
      {children}
    </View>
  );
}

function halfPath(w: number, h: number, notch: 'top' | 'bottom') {
  const r = CORNER;
  const n = NOTCH;
  // Çentikler köşeye ortalı çeyrek daireler; iki parça yan yana gelince yarım daire olur.
  return notch === 'bottom'
    ? `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - n} A${n},${n} 0 0 0 ${w - n},${h} H${n} A${n},${n} 0 0 0 0,${h - n} V${r} A${r},${r} 0 0 1 ${r},0 Z`
    : `M${n},0 H${w - n} A${n},${n} 0 0 0 ${w},${n} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${n} A${n},${n} 0 0 0 ${n},0 Z`;
}

function Field({ label, value, big, wide }: { label: string; value: string; big?: boolean; wide?: boolean }) {
  return (
    <View style={[s.field, wide && { width: '100%' }]}>
      <Text variant="overline" tone="muted">
        {label}
      </Text>
      <Text variant={big ? 'title' : 'bodyStrong'} style={big && { fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  ticket: { width: '100%', maxWidth: 400, alignSelf: 'center', borderRadius: CORNER },
  top: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 26 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: alpha(colors.white, 0.3),
  },
  stub: { paddingHorizontal: 22, paddingTop: NOTCH + 10, paddingBottom: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  field: { width: '50%', paddingRight: 10, gap: 3 },
});
