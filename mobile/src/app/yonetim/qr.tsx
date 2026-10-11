import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, Share, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { useToast } from '@/components/toast';
import { Button, Card, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { WEB_URL } from '@/lib/constants';
import { colors, radius } from '@/lib/theme';

export default function QrScreen() {
  const { business } = useAuth();
  const toast = useToast();
  if (!business) return null;
  const link = `${WEB_URL}/${business.slug}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text tone="muted">QR kodu dükkânınıza asın; bağlantıyı Instagram, WhatsApp ve Google profilinize ekleyin.</Text>

      <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {business.name}
        </Text>
        <Text tone="muted">Randevu almak için kodu okutun</Text>
        <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.white }}>
          <QrCode value={link} size={220} />
        </View>
        <Text variant="label" tone="brand" selectable>
          {link.replace(/^https?:\/\//, '')}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title="Kopyala"
          icon="copy-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(link);
            toast('Bağlantı kopyalandı.');
          }}
        />
        <Button title="Paylaş" icon="share-social-outline" style={{ flex: 1 }} onPress={() => Share.share({ message: `${business.name} için online randevu: ${link}` })} />
      </View>
      <Button title="Sayfamı aç" icon="open-outline" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(link)} />
      <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        Yazdırmak için QR kodu bilgisayardan web panelindeki QR Kod sayfasından indirebilirsiniz.
      </Text>
    </ScrollView>
  );
}
