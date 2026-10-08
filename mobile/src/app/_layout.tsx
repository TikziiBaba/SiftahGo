import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/constants';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.brand,
          headerTitleStyle: { color: colors.text },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="isletme/[slug]" options={{ title: '' }} />
        <Stack.Screen name="giris" options={{ title: 'Giriş Yap', presentation: 'modal' }} />
        <Stack.Screen name="kayit" options={{ title: 'Kayıt Ol', presentation: 'modal' }} />
      </Stack>
    </AuthProvider>
  );
}
