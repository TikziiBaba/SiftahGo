import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Glow, LogoMark } from '@/components/brand';
import { Avatar, Badge, Button, Card, Group, ListRow, ScreenHeader, SectionTitle, styles, Text } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { WEB_URL, type IconName } from '@/lib/constants';
import { colors } from '@/lib/theme';

const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'calendar-outline', text: 'Müşterileriniz 7/24 online randevu alsın' },
  { icon: 'notifications-outline', text: 'Randevuları telefonunuzdan anında yönetin' },
  { icon: 'logo-whatsapp', text: 'WhatsApp ile tek dokunuşla hatırlatın' },
];

export default function AccountScreen() {
  const { session, profile, business } = useAuth();
  const version = Constants.expoConfig?.version;

  if (!session) {
    return (
      <View style={styles.screen}>
        <Glow height={420} />
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title="Hoş geldiniz" subtitle="Randevularınızı takip etmek veya işletmenizi yönetmek için giriş yapın." />
          <View style={{ gap: 10, marginTop: 8 }}>
            <Button title="Giriş Yap" size="lg" onPress={() => router.push('/giris')} />
            <Button title="Hesap Aç" size="lg" variant="secondary" onPress={() => router.push('/kayit')} />
          </View>

          <Card style={{ gap: 14, marginTop: 20 }}>
            <View style={styles.rowCenter}>
              <LogoMark size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="heading">İşletmeniz mi var?</Text>
                <Text variant="caption" tone="muted">
                  Berberden halı sahaya, esnafın randevu defteri.
                </Text>
              </View>
            </View>
            {PERKS.map((p) => (
              <View key={p.text} style={styles.rowCenter}>
                <Ionicons name={p.icon} size={18} color={colors.brand300} />
                <Text tone="secondary" style={{ flex: 1 }}>
                  {p.text}
                </Text>
              </View>
            ))}
            <Button
              title="İşletme hesabı aç"
              icon="storefront-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/kayit', params: { rol: 'isletme' } })}
            />
          </Card>
          {version ? <Version version={version} /> : null}
        </ScrollView>
      </View>
    );
  }

  const isBusiness = profile?.role === 'business';
  const name = profile?.full_name || 'Kullanıcı';

  function logout() {
    Alert.alert('Çıkış yapılsın mı?', undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Glow />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Hesap" />

        <Card onPress={() => router.push('/profil')} accessibilityLabel="Profil bilgileri" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <Avatar name={name} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {session.user.email}
            </Text>
            <Badge
              label={isBusiness ? 'İşletme hesabı' : 'Müşteri hesabı'}
              icon={isBusiness ? 'storefront-outline' : 'person-outline'}
              fg={colors.brand300}
              bg={colors.brandTint}
            />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </Card>

        <SectionTitle title="Hesap" />
        <Group>
          <ListRow icon="person-outline" title="Profil bilgileri" subtitle="Ad, telefon ve şifre" onPress={() => router.push('/profil')} />
          {isBusiness && business ? (
            <ListRow
              icon="globe-outline"
              title="İşletme sayfam"
              subtitle={`${WEB_URL.replace(/^https?:\/\//, '')}/${business.slug}`}
              onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/${business.slug}`)}
            />
          ) : null}
          {isBusiness ? (
            <ListRow
              icon="desktop-outline"
              title="Bilgisayardan yönet"
              subtitle="Web paneli: raporlar ve yazdırılabilir QR"
              onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/panel`)}
            />
          ) : null}
        </Group>

        <Group style={{ marginTop: 12 }}>
          <ListRow icon="log-out-outline" title="Çıkış yap" destructive chevron={false} onPress={logout} />
        </Group>
        {version ? <Version version={version} /> : null}
      </ScrollView>
    </View>
  );
}

function Version({ version }: { version: string }) {
  return (
    <Text variant="caption" tone="muted" style={s.version}>
      SiftahGo · sürüm {version}
    </Text>
  );
}

const s = StyleSheet.create({
  version: { textAlign: 'center', marginTop: 24 },
});
