import { useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/auth-screen';

export default function SignupScreen() {
  const { rol } = useLocalSearchParams<{ rol?: string }>();
  return <AuthScreen initial="signup" business={rol === 'isletme'} />;
}
