import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, Text, View } from 'react-native';

import { Button, Card, Loading, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, WEB_URL } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

export default function AccountScreen() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Loading />;

  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Hoş geldiniz</Text>
        <Text style={styles.muted}>Randevularınızı takip etmek veya işletmenizi yönetmek için giriş yapın.</Text>
        <Button title="Giriş Yap" onPress={() => router.push('/giris')} />
        <Button title="Hesap Aç" variant="secondary" onPress={() => router.push('/kayit')} />
        <Card style={{ gap: 8, marginTop: 12 }}>
          <Text style={styles.h2}>İşletmeniz mi var?</Text>
          <Text style={styles.muted}>İşletme hesabı açın, müşterileriniz 7/24 online randevu alsın.</Text>
          <Button title="İşletme Hesabı Aç" variant="secondary" onPress={() => router.push({ pathname: '/kayit', params: { rol: 'isletme' } })} />
        </Card>
      </ScrollView>
    );
  }

  const isBusiness = profile?.role === 'business';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.brandDark }}>{(profile?.full_name || '?').charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.h2}>{profile?.full_name || 'Kullanıcı'}</Text>
          <Text style={styles.muted}>{session.user.email}</Text>
        </View>
      </View>

      {isBusiness && (
        <Card style={{ gap: 8 }}>
          <Text style={styles.h2}>İşletme yönetimi</Text>
          <Text style={styles.muted}>
            Hizmetler, personel, çalışma saatleri, görseller ve QR kod ayarlarını web panelinden yapabilirsiniz.
          </Text>
          <Button title="Web Panelini Aç" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/panel`)} />
        </Card>
      )}

      <Button title="Çıkış Yap" variant="danger" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}
