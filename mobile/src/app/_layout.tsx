import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, useFonts } from '@expo-google-fonts/geist';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { DevSettings } from 'react-native';

import { ToastProvider } from '@/components/toast';
import { WhatsNew } from '@/components/whats-new';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isShowcase, menuLabel } from '@/lib/constants';
import { installErrorHandler } from '@/lib/error-log';
import { InboxProvider } from '@/lib/inbox';
import { useIntroSeen } from '@/lib/intro';
import { useNotificationTaps, usePushRegistration } from '@/lib/notifications';
import { colors, fonts, isLight, THEME_KEY, themeMode, type ThemeMode, type } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();
// Ekran geçişlerinde görünen kök zemin temayla aynı olsun (app.json'daki koyu renk yerine).
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

// Hata kaydı: yakalanmayan hatalar Supabase'deki error_logs tablosuna gider (web yönetim > Hatalar).
installErrorHandler();

const base = isLight ? DefaultTheme : DarkTheme;
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
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
            <StatusBar style={isLight ? 'dark' : 'light'} />
            <RootStack fontsReady={fontsLoaded || !!fontError} />
          </ToastProvider>
        </ThemeProvider>
      </InboxProvider>
    </AuthProvider>
  );
}

function RootStack({ fontsReady }: { fontsReady: boolean }) {
  const { session, profile, business, loading } = useAuth();
  const introSeen = useIntroSeen();
  // Tema hesap türüne bağlı (müşteri açık, işletme koyu; lib/theme.ts). Uyuşmazsa kaydedilip uygulama yeniden
  // yüklenir; bu sırada açılış ekranı kalır. Kayıt ya da yükleme olmazsa mevcut temayla devam edilir.
  const wanted: ThemeMode = loading || !profile ? themeMode : profile.role === 'business' ? 'dark' : 'light';
  const [themeFailed, setThemeFailed] = useState(false);
  const switching = wanted !== themeMode && !themeFailed;
  const ready = fontsReady && !loading && !switching;

  useEffect(() => {
    if (!switching) return;
    try {
      localStorage.setItem(THEME_KEY, wanted);
      if (localStorage.getItem(THEME_KEY) !== wanted) throw new Error('kaydedilemedi');
      if (__DEV__) DevSettings.reload();
      else Updates.reloadAsync().catch(() => setThemeFailed(true));
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kayıt yoksa yükleme döngüsüne girilmez
      setThemeFailed(true);
    }
  }, [switching, wanted]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Profil ve işletme birlikte yüklendiği için tür belli olmadan ekranlar açılmaz (yanıp sönme yok).
  const showcase = !!business && isShowcase(business);

  usePushRegistration(session?.user.id);
  // Bildirime dokununca açılacak ekranlar oturuma bağlı; oturum yüklenmeden yönlendirme yapılmaz.
  useNotificationTaps(ready && !!session, profile?.role === 'business', showcase);

  // Açılış ekranı, yazı tipi ve oturum hazır olana kadar görünür kalır.
  if (!ready) return null;

  const isBusiness = profile?.role === 'business';
  const approved = business?.approval_status === 'approved';
  // İşletme hesabı açılmış ama işletme henüz oluşturulmamış ya da başvurusu onaylanmamış.
  const needsSetup = isBusiness && !approved;

  return (
    <>
      <WhatsNew />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: type.heading.fontFamily, fontSize: type.heading.fontSize },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}>
        {/* Giriş zorunlu: oturum yokken yalnızca tanıtım (ilk açılışta bir kez) ve giriş ekranları açılır.
            Koruma değişince ilk uygun ekrana geçilir, bu yüzden sıra önemli. */}
        <Stack.Protected guard={!session}>
          <Stack.Protected guard={!introSeen}>
            <Stack.Screen name="tanitim" options={{ headerShown: false, animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Screen name="giris" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="kayit" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="sifremi-unuttum" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={!!session}>
          {/* Müşteri hesabı da aynı hesapla işletme başvurusu yapar. */}
          <Stack.Protected guard={needsSetup || !isBusiness}>
            <Stack.Screen name="kurulum" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!needsSetup}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack.Protected>

          <Stack.Screen name="isletme/[slug]/index" options={{ headerShown: false }} />
          <Stack.Screen name="isletme/[slug]/randevu" options={{ title: 'Randevu' }} />
          <Stack.Screen name="profil" options={{ title: 'Profil' }} />
          <Stack.Screen name="bildirimler" options={{ title: 'Bildirimler' }} />
          <Stack.Screen name="randevularim" options={{ title: 'Randevularım' }} />
          <Stack.Screen name="kuponlarim" options={{ title: 'Kuponlarım' }} />
          <Stack.Screen name="destek/index" options={{ title: 'Destek' }} />
          <Stack.Screen name="destek/[id]" options={{ title: 'Destek talebi' }} />
        </Stack.Protected>

        <Stack.Protected guard={isBusiness && approved}>
          <Stack.Screen name="yonetim/saatler" options={{ title: 'Çalışma saatleri' }} />
          <Stack.Screen name="yonetim/bilgiler" options={{ title: 'İşletme bilgileri' }} />
          <Stack.Screen name="yonetim/gorseller" options={{ title: 'Görseller' }} />
          <Stack.Screen name="yonetim/sayfa" options={{ title: 'Sayfa tasarımı' }} />
          <Stack.Screen name="yonetim/qr" options={{ title: 'QR kod ve bağlantı' }} />
          <Stack.Screen name="yonetim/kuponlar" options={{ title: 'Kuponlar' }} />
          <Stack.Screen name="yonetim/yorumlar" options={{ title: 'Yorumlar' }} />
          <Stack.Screen name="yonetim/abonelik" options={{ title: 'Abonelik' }} />
          <Stack.Screen name="yonetim/fatura" options={{ title: 'Fatura bilgileri' }} />
          <Stack.Screen name="yonetim/dondurma" options={{ title: 'Dondurma talebi' }} />
        </Stack.Protected>

        {/* Randevuyla ilgili ekranlar vitrin esnafına kapalı. */}
        <Stack.Protected guard={isBusiness && approved && !showcase}>
          <Stack.Screen name="yonetim/sadakat" options={{ title: 'Sadakat kartı' }} />
          <Stack.Screen name="randevu-ekle" options={{ title: 'Randevu ekle', presentation: 'modal' }} />
          <Stack.Screen name="yonetim/hizmetler/index" options={{ title: 'Hizmetler' }} />
          <Stack.Screen name="yonetim/hizmetler/[id]" options={{ title: 'Hizmet', presentation: 'modal' }} />
          <Stack.Screen name="yonetim/personel/index" options={{ title: 'Personel' }} />
          <Stack.Screen name="yonetim/personel/[id]" options={{ title: 'Personel', presentation: 'modal' }} />
          <Stack.Screen name="yonetim/izin" options={{ title: 'İzin ekle', presentation: 'modal' }} />
          <Stack.Screen name="yonetim/kurallar" options={{ title: 'Randevu kuralları' }} />
          <Stack.Screen name="yonetim/raporlar" options={{ title: 'Raporlar' }} />
          <Stack.Screen name="yonetim/kasa" options={{ title: 'Kasa' }} />
          <Stack.Screen name="yonetim/engellenenler" options={{ title: 'Engellenen müşteriler' }} />
        </Stack.Protected>

        {/* Menü yalnızca vitrin esnafında. */}
        <Stack.Protected guard={isBusiness && approved && showcase}>
          <Stack.Screen name="yonetim/menu" options={{ title: business ? menuLabel(business.category) : 'Menü' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
