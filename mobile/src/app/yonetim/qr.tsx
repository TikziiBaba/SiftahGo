import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, Share, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { useToast } from '@/components/toast';
import { Button, Card, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { badgeLabel, isShowcase, WEB_URL } from '@/lib/constants';
import { colors, radius } from '@/lib/theme';

// Bağlantılar ?kaynak= ile etiketlidir: ziyaretlerin nereden geldiği istatistikte görünür (web ile aynı).
function ShareCard({ title, link, steps }: { title: string; link: string; steps: string[] }) {
  const toast = useToast();
  return (
    <Card style={{ gap: 8 }}>
      <Text variant="bodyStrong">{title}</Text>
      {steps.map((s, i) => (
        <Text key={i} variant="caption" tone="secondary">
          {i + 1}. {s}
        </Text>
      ))}
      <Button
        title="Bağlantıyı kopyala"
        icon="copy-outline"
        variant="secondary"
        size="sm"
        onPress={async () => {
          await Clipboard.setStringAsync(link);
          toast('Bağlantı kopyalandı.');
        }}
      />
    </Card>
  );
}

export default function QrScreen() {
  const { business } = useAuth();
  const toast = useToast();
  if (!business) return null;
  const link = `${WEB_URL}/${business.slug}`;
  const showcase = isShowcase(business);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text tone="muted">Cam afişini yazdırıp dükkânınıza asın; bağlantıyı Instagram, WhatsApp ve Google profilinize ekleyin.</Text>

      <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {business.name}
        </Text>
        <Text tone="muted">{showcase ? 'Menü ve kuponlar için kodu okutun' : 'Randevu almak için kodu okutun'}</Text>
        <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.white }}>
          <QrCode value={link} size={220} logo={business.logo_url} />
        </View>
        <Text variant="label" tone="brand" selectable>
          {link.replace(/^https?:\/\//, '')}
        </Text>
        {!business.logo_url ? (
          <Button title="Logonuzu ekleyin, QR’ın ortasında görünsün" icon="image-outline" variant="ghost" size="sm" onPress={() => router.push('/yonetim/gorseller')} />
        ) : null}
      </Card>

      <Button title="Cam afişini yazdır" icon="print-outline" size="lg" onPress={() => WebBrowser.openBrowserAsync(`${link}/afis`)} />

      {!showcase && badgeLabel(business) ? (
        <Card style={{ gap: 8 }}>
          <Text variant="bodyStrong">Tebrikler, {badgeLabel(business)} ayının mahallenin gözdesi sizsiniz!</Text>
          <Text tone="muted">Rozet bu ay boyunca sayfanızda görünür. Görseli açıp kaydedin, Instagram'da paylaşın ya da camınıza asın.</Text>
          <Button title="Rozet görselini aç" icon="ribbon-outline" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(`${link}/rozet`)} />
        </Card>
      ) : null}

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
        <Button title="Paylaş" icon="share-social-outline" style={{ flex: 1 }} onPress={() => Share.share({ message: `${business.name} ${showcase ? 'sayfası' : 'için online randevu'}: ${link}` })} />
      </View>
      <Button title="Sayfamı aç" icon="open-outline" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(link)} />
      <ShareCard
        title="Instagram"
        link={`${link}?kaynak=instagram`}
        steps={['Profili düzenle → Bağlantılar → Harici bağlantı ekle deyin, bağlantıyı yapıştırın.', `Başlığa “${showcase ? 'Menüyü gör' : 'Randevu al'}” yazın.`, 'Hikâyelerde Bağlantı çıkartmasıyla da paylaşabilirsiniz.']}
      />
      <ShareCard
        title="Google İşletme Profili"
        link={`${link}?kaynak=google`}
        steps={[
          'Google’da işletmenizin adını aratın (hesabınızla girişli olun) ve Profili düzenle deyin.',
          `İletişim bölümünde ${showcase ? 'Menü bağlantısı' : 'Randevu bağlantıları'} alanına bağlantıyı yapıştırıp kaydedin.`,
          'Onaydan sonra Google Haritalar’daki profilinizde düğme çıkar.',
        ]}
      />
      <Text variant="caption" tone="muted">
        Web siteniz için “Randevu al” düğmesinin kodunu bilgisayardan panelin QR ve bağlantılar sayfasında bulabilirsiniz.
      </Text>
      <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        Afiş tarayıcıda A3 olarak açılır, isterseniz A4 seçebilirsiniz: Yazdır’a dokunup yazıcıya gönderin ya da PDF olarak kaydedip bir kırtasiyede bastırın.
      </Text>
    </ScrollView>
  );
}
