import * as Updates from 'expo-updates';
import { useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, Text } from '@/components/ui';
import changelog from '@/lib/changelog.json';
import { formatDate } from '@/lib/format';
import { colors } from '@/lib/theme';

// Uygulama içi güncellemeyle gelen yenilikler, açılışta bir kez gösterilir. Son görülen kayıt bu cihazda saklanır.
// APK'nın kendi paketiyle açılışta (yeni kurulum ya da APK yükseltmesi) liste gösterilmeden görüldü sayılır.
const KEY = 'siftahgo.changelog';
const latest = Math.max(...changelog.map((e) => e.id));

function pendingEntries() {
  try {
    const seen = Number(localStorage.getItem(KEY) ?? 0);
    if (Updates.isEmbeddedLaunch) {
      if (seen < latest) localStorage.setItem(KEY, String(latest));
      return [];
    }
    return changelog.filter((e) => e.id > seen).sort((a, b) => b.id - a.id);
  } catch {
    return [];
  }
}

export function WhatsNew() {
  const [entries, setEntries] = useState(pendingEntries);
  const close = () => {
    try {
      localStorage.setItem(KEY, String(latest));
    } catch {}
    setEntries([]);
  };

  return (
    <Sheet
      visible={entries.length > 0}
      onClose={close}
      title="Uygulama güncellendi"
      subtitle="Yenilikler"
      footer={<Button title="Tamam" onPress={close} />}>
      {entries.map((e) => (
        <View key={e.id} style={{ gap: 8 }}>
          {entries.length > 1 && (
            <Text variant="caption" tone="muted">
              {formatDate(e.date, false)}
            </Text>
          )}
          {e.items.map((item) => (
            <View key={item} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: colors.brand300 }} />
              <Text style={{ flex: 1 }}>{item}</Text>
            </View>
          ))}
        </View>
      ))}
    </Sheet>
  );
}
