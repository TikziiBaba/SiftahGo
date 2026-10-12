import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, View } from 'react-native';

import { Banner, Button, Card, styles, Text } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/**
 * WhatsApp ile telefon doğrulama (ters doğrulama): müşteri kodu SiftahGo numarasına gönderir,
 * sunucu (/api/whatsapp) gönderen numarayı hesaba bağlar. WhatsApp'tan dönünce hemen kontrol edilir.
 */
export function PhoneVerify({ whatsappNumber, onVerified }: { whatsappNumber: string; onVerified: (phone: string) => void }) {
  const [code, setCode] = useState<{ value: string; expires: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  const check = useCallback(async () => {
    const { data } = await supabase.from('phone_verifications').select('phone, verified_at').maybeSingle();
    if (data?.verified_at && data.phone) {
      haptic.success();
      onVerified(data.phone);
    }
  }, [onVerified]);

  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => {
      if (Date.now() > code.expires) {
        clearInterval(timer);
        setExpired(true);
        return;
      }
      check();
    }, 3000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [code, check]);

  const open = (value: string) =>
    Linking.openURL(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`SiftahGo doğrulama kodum: ${value}`)}`);

  async function start() {
    setBusy(true);
    setError('');
    setExpired(false);
    const { data, error } = await supabase.rpc('start_phone_verification');
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setCode({ value: data as string, expires: Date.now() + 15 * 60_000 });
    open(data as string);
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text variant="bodyStrong">Telefonunuzu doğrulayın</Text>
      <Text tone="muted">
        Sahte randevuları önlemek için numaranızı bir kez WhatsApp ile doğruluyoruz. Ücret alınmaz.
      </Text>
      {!code || expired ? (
        <Button
          title={expired ? 'Kodun süresi doldu, yeni kod al' : 'WhatsApp ile doğrula'}
          icon="logo-whatsapp"
          onPress={start}
          loading={busy}
        />
      ) : (
        <>
          <Text tone="muted">
            WhatsApp&apos;ta açılan hazır mesajı ({code.value}) değiştirmeden gönderin, sonra uygulamaya dönün.
          </Text>
          <View style={styles.rowCenter}>
            <ActivityIndicator color={colors.brand300} />
            <Text tone="muted">Mesajınız bekleniyor…</Text>
          </View>
          <Button title="WhatsApp'ı tekrar aç" icon="logo-whatsapp" variant="secondary" onPress={() => open(code.value)} />
        </>
      )}
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
    </Card>
  );
}
