import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import type { IconName } from '@/lib/constants';
import { useInbox } from '@/lib/inbox';
import { colors, radius, type } from '@/lib/theme';

function icon(name: string) {
  return function TabBarIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    // Seçili sekmede ikonun arkasında hap zemin. Kütüphane iki hali üst üste çizip geçişte soldurur.
    return (
      <View style={[s.pill, focused && { backgroundColor: colors.brandTint }]}>
        <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={size - 2} color={color} />
      </View>
    );
  };
}

export default function TabLayout() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const isBusiness = profile?.role === 'business';
  // Okunmamış bildirimler randevu sekmesinde sayı olarak görünür.
  const { unread } = useInbox();
  const badge = unread ? { tabBarBadge: unread > 9 ? '9+' : unread } : {};

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand300,
        tabBarInactiveTintColor: colors.ink3,
        // Geist etiketleri varsayılan 49 piksellik çubukta kesiliyor (alt boşluğu kütüphane ekler).
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 62 + insets.bottom },
        tabBarLabelStyle: type.tab,
        tabBarHideOnKeyboard: true,
        tabBarBadgeStyle: { ...type.badge, backgroundColor: colors.gold, color: colors.brandInk },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      {/* Müşteri */}
      <Tabs.Protected guard={!isBusiness}>
        <Tabs.Screen name="index" options={{ title: 'Keşfet', tabBarIcon: icon('compass') }} />
        <Tabs.Screen name="randevular" options={{ title: 'Randevularım', tabBarIcon: icon('calendar'), ...badge }} />
      </Tabs.Protected>
      {/* İşletme */}
      <Tabs.Protected guard={isBusiness}>
        <Tabs.Screen name="takvim" options={{ title: 'Takvim', tabBarIcon: icon('calendar'), ...badge }} />
        <Tabs.Screen name="musteriler" options={{ title: 'Müşteriler', tabBarIcon: icon('people') }} />
        <Tabs.Screen name="isletmem" options={{ title: 'İşletmem', tabBarIcon: icon('storefront') }} />
      </Tabs.Protected>
      <Tabs.Screen name="hesap" options={{ title: 'Hesap', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
