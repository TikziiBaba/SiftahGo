import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DynamicButton } from '@/components/dynamic-button';
import { Banner } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/**
 * Ayar ekranlarının altındaki kaydet çubuğu (İşletme bilgileri, Randevu kuralları, Sayfa tasarımı, Çalışma saatleri).
 * Değişiklik yokken pasif; kaydedince düğme bir süre "Kaydedildi" der. onSave false dönerse (hata) başarı gösterilmez.
 */
export function SaveBar({ dirty, error, onSave }: { dirty: boolean; error?: string; onSave: () => Promise<boolean> }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Kaydettikten sonra yeni bir değişiklik yapılırsa düğme hemen "Kaydet"e döner.
  const done = saved && !dirty;

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  async function press() {
    setBusy(true);
    const ok = await onSave();
    setBusy(false);
    if (!ok) return;
    haptic.success();
    setSaved(true);
  }

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <DynamicButton
        title={busy ? 'Kaydediliyor' : done ? 'Kaydedildi' : 'Kaydet'}
        icon={done && !busy ? 'checkmark' : undefined}
        loading={busy}
        disabled={!dirty && !done}
        onPress={press}
      />
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
