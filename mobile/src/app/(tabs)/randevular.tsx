import { router } from 'expo-router';
import { View } from 'react-native';

import { BusinessAgenda } from '@/components/business-agenda';
import { CustomerAppointments } from '@/components/customer-appointments';
import { Button, Empty, Loading, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function AppointmentsScreen() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Loading />;
  if (!session) {
    return (
      <View style={styles.content}>
        <Empty text="Randevularınızı görmek için giriş yapın.">
          <Button title="Giriş Yap" onPress={() => router.push('/giris')} style={{ alignSelf: 'stretch' }} />
          <Button title="Hesap Aç" variant="secondary" onPress={() => router.push('/kayit')} style={{ alignSelf: 'stretch' }} />
        </Empty>
      </View>
    );
  }
  return profile?.role === 'business' ? <BusinessAgenda userId={session.user.id} /> : <CustomerAppointments userId={session.user.id} />;
}
