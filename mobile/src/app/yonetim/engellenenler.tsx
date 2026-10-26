import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import { RevealCell } from '@/components/motion';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { BlockedCustomer, Business } from '@/lib/types';

export default function BlockedScreen() {
  const { business } = useAuth();
  return business ? <BlockedList business={business} /> : null;
}

/** İşletmenin engellediği müşteriler (randevu kartındaki "Engelle" ile eklenir); engel buradan kaldırılır. */
function BlockedList({ business }: { business: Business }) {
  const toast = useToast();
  const [rows, setRows] = useState<BlockedCustomer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('blocked_customers')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as BlockedCustomer[]));
  }, [business.id]);

  async function unblock(row: BlockedCustomer) {
    setBusy(row.id);
    const { error } = await supabase.from('blocked_customers').delete().eq('id', row.id);
    setBusy(null);
    if (error) return toast(errorMessage(error), 'error');
    setRows((r) => r && r.filter((x) => x.id !== row.id));
    toast(`${row.customer_name || 'Müşteri'}: engel kaldırıldı`);
  }

  const list = rows ?? [];

  return (
    <FlatList
      style={styles.screen}
      data={list}
      keyExtractor={(x) => x.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <Text tone="muted">
          Engellenen müşteri sayfanızdan online randevu alamaz (hesabı ve telefon numarası). Randevu kartındaki “Engelle” ile eklenir; son 6 ayda size 2
          kez gelmeyen müşteri de otomatik olarak eklenir.
        </Text>
      }
      ListEmptyComponent={
        rows === null ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : (
          <Empty icon="shield-checkmark-outline" title="Engellenen müşteri yok" />
        )
      }
      CellRendererComponent={RevealCell}
      renderItem={({ item: x }) => (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="ban" size={20} color={colors.danger} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {x.customer_name || 'İsimsiz'}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[x.phone_key && `0${x.phone_key}`, formatDate(x.created_at, false)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Button title="Engeli kaldır" variant="secondary" size="sm" loading={busy === x.id} disabled={!!busy} onPress={() => unblock(x)} />
        </Card>
      )}
    />
  );
}
