import { router } from 'expo-router';
import { View } from 'react-native';

import { Glow } from '@/components/brand';
import { CustomerAppointments } from '@/components/customer-appointments';
import { Button, Empty, ScreenHeader, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function AppointmentsScreen() {
  const { session } = useAuth();

  if (!session) {
    return (
      <View style={styles.screen}>
        <Glow />
        <View style={styles.content}>
          <ScreenHeader title="Randevularım" />
          <Empty icon="calendar-outline" title="Randevularınız burada" text="Aldığınız randevuları görmek, iptal etmek ve değerlendirmek için giriş yapın.">
            <Button title="Giriş Yap" onPress={() => router.push('/giris')} />
            <Button title="Hesap Aç" variant="secondary" onPress={() => router.push('/kayit')} />
          </Empty>
        </View>
      </View>
    );
  }
  return <CustomerAppointments userId={session.user.id} />;
}
