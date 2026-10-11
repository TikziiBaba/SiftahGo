import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Chip, Field, Text } from '@/components/ui';
import type { IconName } from '@/lib/constants';
import { addDays, isoWeekday, MONTHS, shortDay, todayStr } from '@/lib/format';
import { useAccent } from '@/lib/accent';
import { haptic } from '@/lib/haptics';
import { alpha, colors, fonts, radius } from '@/lib/theme';

/** Arama kutulu tek seçimlik liste (şehir, kategori) */
export function OptionSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
  searchable,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T | null;
  onSelect: (value: T) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const list = q ? options.filter((o) => o.label.toLocaleLowerCase('tr-TR').includes(q)) : options;

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close} title={title} tall={searchable}>
      {searchable && <Field icon="search-outline" placeholder="Ara" value={query} onChangeText={setQuery} autoCorrect={false} />}
      <View>
        {list.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                haptic.select();
                onSelect(o.value);
                close();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [s.option, pressed && { backgroundColor: colors.white04 }]}>
              {o.icon && <Ionicons name={o.icon} size={20} color={on ? colors.brand300 : colors.ink3} />}
              <Text variant={on ? 'bodyStrong' : 'body'} tone={on ? 'brand' : 'default'} style={{ flex: 1 }}>
                {o.label}
              </Text>
              {on && <Ionicons name="checkmark" size={20} color={colors.brand300} />}
            </Pressable>
          );
        })}
        {list.length === 0 && (
          <Text tone="muted" style={{ textAlign: 'center', paddingVertical: 24 }}>
            Sonuç yok
          </Text>
        )}
      </View>
    </Sheet>
  );
}

/** "HH:mm" seçenekleri: from ile to arası (to dahil değil) */
export function timeOptions(stepMinutes = 30, from = '00:00', to = '24:00') {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const list: string[] = [];
  for (let m = toMin(from); m < toMin(to); m += stepMinutes) {
    list.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return list;
}

export function TimeSheet({
  visible,
  onClose,
  title,
  value,
  onSelect,
  step = 30,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string | null;
  onSelect: (time: string) => void;
  step?: number;
}) {
  // Gece saatleri nadiren kullanılır; liste 06:00'dan başlar.
  const options = timeOptions(step, '06:00');
  // Web panelinden girilmiş 08:45 gibi bir saat ızgarada yoksa da seçili görünsün.
  if (value && !options.includes(value)) options.push(value);
  options.sort();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} tall>
      <View style={s.grid}>
        {options.map((t) => (
          <Chip
            key={t}
            label={t}
            solid
            selected={t === value}
            onPress={() => {
              onSelect(t);
              onClose();
            }}
            style={s.timeChip}
          />
        ))}
      </View>
    </Sheet>
  );
}

const WEEK_HEAD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Ay görünümlü tarih seçici */
export function CalendarSheet({
  visible,
  onClose,
  title,
  value,
  onSelect,
  min,
  max,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onSelect: (day: string) => void;
  min?: string;
  max?: string;
}) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const first = `${month}-01`;
  const lead = isoWeekday(first) - 1;
  const nextMonth = addDays(`${month}-28`, 7).slice(0, 7);
  const prevMonth = addDays(first, -1).slice(0, 7);
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const today = todayStr();
  const [y, m] = month.split('-').map(Number);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={s.monthHead}>
        <Pressable
          onPress={() => setMonth(prevMonth)}
          disabled={!!min && prevMonth < min.slice(0, 7)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Önceki ay"
          style={({ pressed }) => [s.monthNav, pressed && { opacity: 0.6 }, !!min && prevMonth < min.slice(0, 7) && { opacity: 0.25 }]}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text variant="heading">
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable
          onPress={() => setMonth(nextMonth)}
          disabled={!!max && nextMonth > max.slice(0, 7)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Sonraki ay"
          style={({ pressed }) => [s.monthNav, pressed && { opacity: 0.6 }, !!max && nextMonth > max.slice(0, 7) && { opacity: 0.25 }]}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <View style={s.week}>
        {WEEK_HEAD.map((d) => (
          <Text key={d} variant="caption" tone="muted" style={s.weekCell}>
            {d}
          </Text>
        ))}
      </View>
      <View style={s.days}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={s.dayCell} />;
          const disabled = (!!min && d < min) || (!!max && d > max);
          const selected = d === value;
          return (
            <Pressable
              key={d}
              disabled={disabled}
              onPress={() => {
                haptic.select();
                onSelect(d);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              style={s.dayCell}>
              <View style={[s.day, d === today && s.today, selected && s.daySelected]}>
                <Text
                  style={{
                    fontFamily: selected || d === today ? fonts.semibold : fonts.regular,
                    fontSize: 15,
                    color: selected ? colors.brandInk : colors.ink,
                    // Seçilemeyen gün (geçmiş ya da kapalı) soluk görünür.
                    opacity: disabled && !selected ? 0.3 : 1,
                  }}>
                  {Number(d.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Form içinde seçim kutusu (tarih, saat, şehir, kategori); dokununca seçici açılır. */
export function SelectField({
  label,
  icon,
  value,
  placeholder = 'Seçin',
  onPress,
  style,
}: {
  label?: string;
  icon?: IconName;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? ''} ${value ?? placeholder}`}
        style={({ pressed }) => [s.select, pressed && { borderColor: colors.brandRing }]}>
        {icon && <Ionicons name={icon} size={18} color={colors.ink3} />}
        <Text style={{ flex: 1 }} tone={value ? 'default' : 'muted'} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.ink3} />
      </Pressable>
    </View>
  );
}

/** Yatay gün şeridi (randevu alma, randevu ekleme) */
export function DayStrip({
  days,
  value,
  onChange,
  onMore,
}: {
  days: { day: string; disabled?: boolean }[];
  value: string;
  onChange: (day: string) => void;
  /** Sonda takvim düğmesi gösterir */
  onMore?: () => void;
}) {
  const accent = useAccent();
  const selectedStyle = { backgroundColor: accent.base, borderColor: accent.base, boxShadow: `0 8px 20px -8px ${alpha(accent.base, 0.6)}` };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
      {days.map(({ day, disabled }) => {
        const d = shortDay(day);
        const selected = day === value;
        return (
          <Pressable
            key={day}
            disabled={disabled}
            onPress={() => {
              haptic.select();
              onChange(day);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${d.date} ${d.month} ${d.weekday}${disabled ? ', kapalı' : ''}`}
            accessibilityState={{ selected, disabled: !!disabled }}
            style={({ pressed }) => [s.stripDay, selected && selectedStyle, disabled && { opacity: 0.3 }, pressed && { opacity: 0.75 }]}>
            <Text variant="caption" style={{ color: selected ? accent.ink : colors.ink3 }}>
              {d.weekday}
            </Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 20, lineHeight: 24, color: selected ? accent.ink : colors.ink }}>{d.date}</Text>
            <Text variant="caption" style={{ color: selected ? accent.ink : colors.ink3 }}>
              {d.month}
            </Text>
          </Pressable>
        );
      })}
      {onMore && (
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel="Takvimden seç" style={({ pressed }) => [s.stripDay, pressed && { opacity: 0.75 }]}>
          <Ionicons name="calendar-outline" size={22} color={colors.brand300} />
          <Text variant="caption" tone="brand">
            Takvim
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 6, borderRadius: radius.md },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { flexBasis: '22%', flexGrow: 1, maxWidth: '24%', paddingHorizontal: 0 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthNav: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white04,
    borderWidth: 1,
    borderColor: colors.line,
  },
  week: { flexDirection: 'row' },
  weekCell: { width: `${100 / 7}%`, textAlign: 'center' },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderColor: colors.brandRing },
  daySelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  stripDay: {
    width: 62,
    height: 78,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopColor: colors.edge,
  },
});
