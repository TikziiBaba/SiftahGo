import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, STATUS } from '@/lib/constants';
import type { AppointmentStatus } from '@/lib/types';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const v = variants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, v.box, (pressed || disabled) && { opacity: 0.6 }, style]}>
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{title}</Text>}
    </Pressable>
  );
}

const variants = {
  primary: { box: { backgroundColor: colors.brand }, text: { color: '#fff' } },
  secondary: { box: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d6d3d1' }, text: { color: colors.text } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: colors.muted } },
  danger: { box: { backgroundColor: 'transparent' }, text: { color: colors.danger } },
};

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#a8a29e" style={styles.input} {...props} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={{ color: s.fg, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
    </View>
  );
}

export function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', padding: 28, gap: 12 }}>
      <Text style={{ color: colors.muted, textAlign: 'center' }}>{text}</Text>
      {children}
    </Card>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40 }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  label: { fontSize: 14, fontWeight: '500', color: '#44403c' },
  input: {
    borderWidth: 1,
    borderColor: '#d6d3d1',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  error: { color: colors.danger, fontSize: 14 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#d6d3d1', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
});
