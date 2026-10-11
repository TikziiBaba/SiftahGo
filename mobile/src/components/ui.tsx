import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccent } from '@/lib/accent';
import { STATUS, type IconName } from '@/lib/constants';
import { haptic } from '@/lib/haptics';
import { alpha, colors, fonts, radius, type } from '@/lib/theme';
import type { AppointmentStatus } from '@/lib/types';

type Tone = 'default' | 'secondary' | 'muted' | 'brand' | 'gold' | 'danger' | 'success' | 'warning' | 'onBrand';

const TONES: Record<Tone, string> = {
  default: colors.ink,
  secondary: colors.ink2,
  muted: colors.ink3,
  brand: colors.brand300,
  gold: colors.gold,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  onBrand: colors.brandInk,
};

export function Text({ variant = 'body', tone = 'default', style, ...props }: TextProps & { variant?: keyof typeof type; tone?: Tone }) {
  return <RNText maxFontSizeMultiplier={1.4} {...props} style={[type[variant], { color: TONES[tone] }, style]} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';

// Birincil düğme sayfa rengini (useAccent) kullanır; diğerleri sabit.
const BUTTONS: Record<Exclude<ButtonVariant, 'primary'>, { box: ViewStyle; text: string }> = {
  secondary: { box: { backgroundColor: colors.white04, borderWidth: 1, borderColor: colors.lineStrong }, text: colors.ink },
  ghost: { box: { backgroundColor: 'transparent' }, text: colors.ink2 },
  danger: { box: { backgroundColor: colors.dangerSolid }, text: colors.white },
  dangerGhost: { box: { backgroundColor: colors.dangerTint }, text: colors.danger },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = useAccent();
  const v =
    variant === 'primary'
      ? { box: { backgroundColor: accent.base, boxShadow: `0 8px 24px -8px ${alpha(accent.base, 0.55)}` }, text: accent.ink }
      : BUTTONS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        haptic.press();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        s.button,
        { height: size === 'lg' ? 54 : size === 'sm' ? 38 : 48, paddingHorizontal: size === 'sm' ? 12 : 20 },
        v.box,
        disabled && { opacity: 0.4, boxShadow: undefined },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={v.text} />}
          <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: v.text }} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color = colors.ink,
  size = 40,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.press();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        s.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
        style,
      ]}>
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color} />
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  icon,
  right,
  containerStyle,
  onFocus,
  onBlur,
  multiline,
  style,
  ...props
}: TextInputProps & { label?: string; hint?: string; error?: string; icon?: IconName; right?: React.ReactNode; containerStyle?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}
      <View style={[s.fieldBox, multiline && { alignItems: 'flex-start' }, focused && s.fieldFocused, !!error && { borderColor: colors.danger }]}>
        {icon && <Ionicons name={icon} size={18} color={focused ? colors.brand300 : colors.ink3} style={multiline && { marginTop: 14 }} />}
        <TextInput
          // Görünen etiket ekran okuyucuya da alanın adı olarak okunur.
          accessibilityLabel={label ?? props.placeholder}
          placeholderTextColor={colors.ink3}
          selectionColor={colors.brand}
          cursorColor={colors.brand}
          keyboardAppearance="dark"
          {...props}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[s.input, multiline && { minHeight: 96, textAlignVertical: 'top' }, style]}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  solid,
  disabled,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Seçiliyken dolu sayfa rengi (saat, gün gibi) */
  solid?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = useAccent();
  const fg = selected ? (solid ? accent.ink : accent.light) : colors.ink2;
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [
        s.chip,
        selected &&
          (solid
            ? { backgroundColor: accent.base, borderColor: accent.base }
            : { backgroundColor: alpha(accent.base, 0.12), borderColor: alpha(accent.base, 0.4) }),
        disabled && { opacity: 0.3 },
        pressed && { opacity: 0.75 },
        style,
      ]}>
      {icon && <Ionicons name={icon} size={15} color={fg} />}
      <Text variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, fg = colors.ink2, bg = colors.white04, icon }: { label: string; fg?: string; bg?: string; icon?: IconName }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={fg} />}
      <Text variant="caption" style={{ color: fg, fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const st = STATUS[status];
  return <Badge label={st.label} fg={st.fg} bg={st.bg} />;
}

export function Empty({
  icon = 'sparkles-outline',
  title,
  text,
  children,
}: {
  icon?: IconName;
  title?: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.brand300} />
      </View>
      {title ? (
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {title}
        </Text>
      ) : null}
      {text ? (
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {text}
        </Text>
      ) : null}
      {children ? <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>{children}</View> : null}
    </View>
  );
}

export function Loading({ full }: { full?: boolean }) {
  return (
    <View style={[{ padding: 40, alignItems: 'center' }, full && { flex: 1, justifyContent: 'center', backgroundColor: colors.bg }]}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

/** Yüklenirken içeriğin yerini tutan yanıp sönen blok */
export function Skeleton({ height = 72, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ height, borderRadius: radius.lg, backgroundColor: colors.surface2 }, style, animated]} />;
}

/** Satırları ince çizgiyle ayrılmış liste kutusu (ayarlar menüsü gibi) */
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children);
  return (
    <View style={[s.card, { padding: 0, overflow: 'hidden' }, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={s.divider} />}
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  right,
  onPress,
  chevron = !!onPress,
  destructive,
  disabled,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <View style={s.row}>
      {icon && (
        <View style={[s.rowIcon, destructive && { backgroundColor: colors.dangerTint }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? (destructive ? colors.danger : colors.brand300)} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" tone={destructive ? 'danger' : 'default'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="label" tone="muted">
          {value}
        </Text>
      ) : null}
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.ink3} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [pressed && { backgroundColor: colors.white04 }, disabled && { opacity: 0.45 }]}>
      {content}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionTitle}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text variant="label" tone="brand">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const toggle = (next: boolean) => {
    haptic.select();
    onValueChange(next);
  };
  return (
    <Pressable
      onPress={() => toggle(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[s.row, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={toggle}
        disabled={disabled}
        trackColor={{ false: colors.surface3, true: colors.brand700 }}
        thumbColor={value ? colors.brand300 : colors.ink3}
        ios_backgroundColor={colors.surface3}
      />
    </Pressable>
  );
}

/** Türkçe büyük harf (i -> İ); Hermes yerel ayarı yok sayabiliyor. */
function upper(c: string) {
  return c === 'i' ? 'İ' : c === 'ı' ? 'I' : c.toUpperCase();
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return upper(parts[0][0]) + (parts.length > 1 ? upper(parts[parts.length - 1][0]) : '');
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <RNText style={{ fontFamily: fonts.semibold, fontSize: size * 0.38, color: colors.brand300 }}>{initials(name)}</RNText>
    </View>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: IconName }) {
  return (
    <View style={[s.card, { flex: 1, padding: 14, gap: 4 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Ionicons name={icon} size={14} color={colors.ink3} />}
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="title" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const BANNERS = {
  info: { fg: colors.brand300, bg: colors.brandTint, border: colors.brandLine },
  warning: { fg: colors.warning, bg: colors.warningTint, border: colors.warningLine },
  danger: { fg: colors.danger, bg: colors.dangerTint, border: colors.dangerLine },
  success: { fg: colors.success, bg: colors.successTint, border: colors.successLine },
};

export function Banner({
  tone = 'info',
  icon = 'information-circle-outline',
  title,
  text,
  onPress,
}: {
  tone?: keyof typeof BANNERS;
  icon?: IconName;
  title?: string;
  text: string;
  onPress?: () => void;
}) {
  const b = BANNERS[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.banner, { backgroundColor: b.bg, borderColor: b.border }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={20} color={b.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="bodyStrong" style={{ color: b.fg }}>
            {title}
          </Text>
        ) : null}
        <Text variant="label" tone="secondary">
          {text}
        </Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={b.fg} />}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.segment, on && s.segmentOn]}>
            <Text variant="label" tone={on ? 'default' : 'muted'}>
              {o.label}
            </Text>
            {o.count ? (
              <View style={s.segmentCount}>
                <Text variant="caption" style={{ color: colors.brandInk, fontFamily: fonts.semibold }}>
                  {o.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Sekme ekranlarının büyük başlığı (üst güvenli alan dahil) */
export function ScreenHeader({ title, subtitle, eyebrow, right }: { title: string; subtitle?: string; eyebrow?: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screenHeader, { paddingTop: insets.top + 16 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        {eyebrow ? (
          <Text variant="overline" tone="brand">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="display">{title}</Text>
        {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

const s = StyleSheet.create({
  screenHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingBottom: 4 },
  button: { borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white04,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  fieldFocused: { borderColor: colors.brandRing, backgroundColor: colors.surface3 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 13, outlineWidth: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopColor: colors.edge,
    padding: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white04,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong, marginLeft: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 58 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.white04, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  avatar: {
    backgroundColor: colors.brandTint,
    borderWidth: 1,
    borderColor: colors.brandLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, borderWidth: 1, padding: 14 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segment: { flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segmentOn: { backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.lineStrong },
  segmentCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
