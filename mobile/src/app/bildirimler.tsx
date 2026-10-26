import Ionicons from '@expo/vector-icons/Ionicons';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, StyleSheet, View } from 'react-native';

import { RevealCell } from '@/components/motion';
import { Banner, Empty, PressableScale, SectionTitle, Segmented, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { IconName } from '@/lib/constants';
import { addDays, dayOf, formatTime, relativeDay, shortDay, todayStr } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useInbox, type InboxItem } from '@/lib/inbox';
import { openNotificationTarget, registerPushToken } from '@/lib/notifications';
import { colors, radius } from '@/lib/theme';

const KIND: Record<InboxItem['kind'], { icon: IconName; fg: string; bg: string }> = {
  booked: { icon: 'calendar', fg: colors.brand300, bg: colors.brandTint },
  confirmed: { icon: 'checkmark-circle', fg: colors.success, bg: colors.successTint },
  cancelled: { icon: 'close-circle', fg: colors.danger, bg: colors.dangerTint },
  rescheduled: { icon: 'time', fg: colors.brand300, bg: colors.brandTint },
  reminder: { icon: 'alarm', fg: colors.gold, bg: colors.goldTint },
  review: { icon: 'star', fg: colors.gold, bg: colors.goldTint },
  reviewed: { icon: 'chatbubble-ellipses', fg: colors.gold, bg: colors.goldTint },
};

/** Bugünkü bildirimde saat, dün "Dün", daha eskide "12 Eki" */
function when(iso: string) {
  const day = dayOf(iso);
  if (day === todayStr()) return formatTime(iso);
  const rel = relativeDay(day);
  if (rel === 'Dün') return rel;
  const d = shortDay(day);
  return `${d.date} ${d.month}`;
}

/** Listedeki gün başlığı */
function period(iso: string) {
  const day = dayOf(iso);
  const today = todayStr();
  if (day === today) return 'Bugün';
  if (day === addDays(today, -1)) return 'Dün';
  if (day >= addDays(today, -6)) return 'Bu hafta';
  return 'Daha eski';
}

type Entry = { key: string; title?: string; item?: InboxItem };

export default function InboxScreen() {
  const { profile } = useAuth();
  const { items, markAllRead } = useInbox();
  const [permission, setPermission] = useState<Notifications.NotificationPermissionsStatus | null>(null);
  // İşletme hesabında kendi aldığı randevuların bildirimleri ayrı ("Kişisel")
  const [scope, setScope] = useState<'business' | 'customer'>('business');

  useFocusEffect(
    useCallback(() => {
      if (Device.isDevice) Notifications.getPermissionsAsync().then(setPermission, () => {});
      // Okunmamışlar ekrandayken vurgulu kalır, ekrandan çıkınca okundu sayılır.
      return () => {
        markAllRead();
      };
    }, [markAllRead]),
  );

  async function enable() {
    if (permission?.canAskAgain) {
      await registerPushToken();
      setPermission(await Notifications.getPermissionsAsync());
    } else Linking.openSettings();
  }

  const isBusiness = profile?.role === 'business';
  // Seçim yalnızca işletme hesabında ve kişisel bildirim varken görünür.
  const split = isBusiness && !!items?.some((i) => i.recipient === 'customer');
  const shown = (items ?? []).filter((i) => !split || i.recipient === scope);
  const unread = (r: InboxItem['recipient']) => (items ?? []).filter((i) => i.recipient === r && !i.read_at).length;
  // Bildirimler yeniden eskiye sıralı gelir; gün değiştikçe başlık eklenir.
  const entries: Entry[] = [];
  let last = '';
  for (const item of shown) {
    const title = period(item.created_at);
    if (title !== last) entries.push({ key: `baslik-${title}`, title });
    last = title;
    entries.push({ key: item.id, item });
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { gap: 8 }]}
      data={entries}
      keyExtractor={(e) => e.key}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          {permission && !permission.granted ? (
            <Banner
              tone="warning"
              icon="notifications-off-outline"
              title="Bildirimler kapalı"
              text={permission.canAskAgain ? 'Telefonunuza bildirim gelmesi için dokunup izin verin.' : 'Telefon ayarlarından SiftahGo bildirimlerini açabilirsiniz.'}
              onPress={enable}
            />
          ) : null}
          {split && (
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'business', label: 'İşletme', count: unread('business') },
                { value: 'customer', label: 'Kişisel', count: unread('customer') },
              ]}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        items ? (
          <Empty
            icon="notifications-outline"
            title="Henüz bildirim yok"
            text={
              isBusiness && scope === 'business'
                ? 'Yeni randevular, onay bekleyenler ve iptaller burada görünür.'
                : 'Randevu onayları, iptaller ve hatırlatmalar burada görünür.'
            }
          />
        ) : (
          <View style={{ gap: 8 }}>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </View>
        )
      }
      CellRendererComponent={RevealCell}
      renderItem={({ item: e }) => (e.item ? <Row item={e.item} businessAccount={isBusiness} /> : <SectionTitle title={e.title ?? ''} />)}
    />
  );
}

function Row({ item, businessAccount }: { item: InboxItem; businessAccount: boolean }) {
  const k = KIND[item.kind];
  const unread = !item.read_at;
  return (
    <PressableScale
      onPress={() => {
        haptic.press();
        openNotificationTarget({ kind: item.kind, recipient: item.recipient, appointmentId: item.appointment_id, startsAt: item.appointments?.starts_at, businessAccount });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Okunmamış. ' : ''}${item.title}. ${item.body}`}
      scale={0.98}
      style={[s.row, unread && s.unread]}>
      <View style={[s.icon, { backgroundColor: k.bg }]}>
        <Ionicons name={k.icon} size={20} color={k.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.titleRow}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {item.title}
          </Text>
          <Text variant="caption" tone="muted">
            {when(item.created_at)}
          </Text>
        </View>
        <Text variant="label" tone="secondary" numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {unread && <View style={s.dot} />}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  unread: { backgroundColor: colors.surface2, borderColor: colors.lineStrong },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
