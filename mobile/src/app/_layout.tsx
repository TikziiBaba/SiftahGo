import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, useFonts } from '@expo-google-fonts/geist';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { InboxProvider } from '@/lib/inbox';
import { useNotificationTaps, usePushRegistration } from '@/lib/notifications';
import { colors, fonts } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.brand300,
    background: colors.bg,
    card: colors.bg,
    text: colors.ink,
    border: colors.line,
    notification: colors.gold,
  },
  fonts: {
    regular: { fontFamily: fonts.regular, fontWeight: 'normal' },
    medium: { fontFamily: fonts.medium, fontWeight: 'normal' },
    bold: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    heavy: { fontFamily: fonts.bold, fontWeight: 'normal' },
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  return (
    <AuthProvider>
      <InboxProvider>
        <ThemeProvider value={theme}>
          <ToastProvider>
            <StatusBar style="light" />
            <RootStack fontsReady={fontsLoaded || !!fontError} />
          </ToastProvider>
        </ThemeProvider>
      </InboxProvider>
    </AuthProvider>
  );
}

function RootStack({ fontsReady }: { fontsReady: boolean }) {
  const { session, profile, business, loading } = useAuth();
  const ready = fontsReady && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  usePushRegistration(session?.user.id);
  // Bildirime dokununca açılacak ekranlar oturuma bağlı; oturum yüklenmeden yönlendirme yapılmaz.
  useNotificationTaps(ready && !!session);

  // Açılış ekranı, yazı tipi ve oturum hazır olana kadar görünür kalır.
  if (!ready) return null;

  const isBusiness = profile?.role === 'business';
  // İşletme hesabı açılmış ama işletme henüz oluşturulmamış.
  const needsSetup = isBusiness && !business;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Protected guard={needsSetup}>
        <Stack.Screen name="kurulum" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!needsSetup}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Screen name="isletme/[slug]/index" options={{ headerShown: false }} />
      <Stack.Screen name="isletme/[slug]/randevu" options={{ title: 'Randevu' }} />

      <Stack.Protected guard={!session}>
        <Stack.Screen name="giris" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="kayit" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="sifremi-unuttum" options={{ title: 'Şifremi unuttum', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="profil" options={{ title: 'Profil' }} />
        <Stack.Screen name="bildirimler" options={{ title: 'Bildirimler' }} />
      </Stack.Protected>

      <Stack.Protected guard={isBusiness && !!business}>
        <Stack.Screen name="randevu-ekle" options={{ title: 'Randevu ekle', presentation: 'modal' }} />
        <Stack.Screen name="yonetim/hizmetler/index" options={{ title: 'Hizmetler' }} />
        <Stack.Screen name="yonetim/hizmetler/[id]" options={{ title: 'Hizmet', presentation: 'modal' }} />
        <Stack.Screen name="yonetim/personel/index" options={{ title: 'Personel' }} />
        <Stack.Screen name="yonetim/personel/[id]" options={{ title: 'Personel', presentation: 'modal' }} />
        <Stack.Screen name="yonetim/saatler" options={{ title: 'Çalışma saatleri' }} />
        <Stack.Screen name="yonetim/izin" options={{ title: 'İzin ekle', presentation: 'modal' }} />
        <Stack.Screen name="yonetim/bilgiler" options={{ title: 'İşletme bilgileri' }} />
        <Stack.Screen name="yonetim/gorseller" options={{ title: 'Görseller' }} />
        <Stack.Screen name="yonetim/sayfa" options={{ title: 'Sayfa görünümü' }} />
        <Stack.Screen name="yonetim/qr" options={{ title: 'QR kod ve bağlantı' }} />
        <Stack.Screen name="yonetim/raporlar" options={{ title: 'Raporlar' }} />
        <Stack.Screen name="yonetim/yorumlar" options={{ title: 'Yorumlar' }} />
        <Stack.Screen name="yonetim/abonelik" options={{ title: 'Abonelik' }} />
      </Stack.Protected>
    </Stack>
  );
}
