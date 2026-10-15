import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { useInbox } from '@/lib/inbox';
import { colors, type } from '@/lib/theme';

/** Başlıktaki bildirim düğmesi; okunmamış sayısını gösterir. */
export function InboxBell() {
  const { unread } = useInbox();
  return (
    <View>
      <IconButton
        icon={unread ? 'notifications' : 'notifications-outline'}
        label={unread ? `Bildirimler, ${unread} okunmamış` : 'Bildirimler'}
        onPress={() => router.push('/bildirimler')}
      />
      {unread > 0 && (
        <View style={s.badge} pointerEvents="none">
          <Text style={s.count}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { ...type.badge, color: colors.brandInk },
});
