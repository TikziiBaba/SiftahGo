import { CustomerAppointments } from '@/components/customer-appointments';
import { useAuth } from '@/lib/auth';

/** İşletme sahibinin başka işletmelerden aldığı randevular (müşteride bu liste sekmede, randevular.tsx). */
export default function MyAppointmentsScreen() {
  const { session } = useAuth();
  return session ? <CustomerAppointments userId={session.user.id} header={false} /> : null;
}
