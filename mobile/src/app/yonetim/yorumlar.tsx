import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Avatar, Button, Card, Empty, Field, Segmented, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, formatDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Review } from '@/lib/types';

type Row = Review & { appointments: { service_name: string } | null };

export default function ReviewsScreen() {
  const { business } = useAuth();
  return business ? <Reviews business={business} /> : null;
}

function Reviews({ business }: { business: Business }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<'all' | 'open'>('all');
  const [editing, setEditing] = useState<Row | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('*, appointments(service_name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows((data ?? []) as Row[]);
  }, [business.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(r: Row) {
    setEditing(r);
    setReply(r.reply);
    setError('');
  }

  async function save(text: string) {
    if (!editing) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('reply_review', { p_id: editing.id, p_reply: text });
    setBusy(false);
    if (error) {
      haptic.error();
      return setError(errorMessage(error));
    }
    haptic.success();
    setEditing(null);
    toast(text.trim() ? 'Cevabınız yayınlandı.' : 'Cevap kaldırıldı.');
    load();
  }

  const all = rows ?? [];
  const openCount = all.filter((r) => !r.reply).length;
  const list = tab === 'open' ? all.filter((r) => !r.reply) : all;

  return (
    <View style={styles.screen}>
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Text variant="display">
                {business.rating_count > 0 ? Number(business.rating_avg).toFixed(1) : '—'}
              </Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Stars value={Math.round(Number(business.rating_avg))} size={16} />
                <Text tone="muted">{business.rating_count} değerlendirme</Text>
              </View>
            </Card>
            <Text tone="muted">Sadece randevusu gerçekleşen müşteriler puan verebilir. Cevabınız sayfanızda herkese görünür.</Text>
            {all.length > 0 && (
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'all', label: 'Tümü', count: all.length },
                  { value: 'open', label: 'Cevap bekleyen', count: openCount },
                ]}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          rows === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={110} />
              <Skeleton height={110} />
            </View>
          ) : (
            <Empty
              icon="chatbubbles-outline"
              title={all.length === 0 ? 'Henüz değerlendirme yok' : 'Cevap bekleyen yorum yok'}
              text={all.length === 0 ? 'Randevudan sonra müşterilerinize puan vermeleri için otomatik hatırlatma gider.' : 'Tüm yorumlara cevap verdiniz.'}
            />
          )
        }
        renderItem={({ item: r }) => (
          <Card style={{ gap: 10 }}>
            <View style={styles.rowCenter}>
              <Avatar name={r.customer_name} size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{r.customer_name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {r.appointments?.service_name ? `${r.appointments.service_name} · ` : ''}
                  {formatDate(r.created_at, false)}
                </Text>
              </View>
              <Stars value={r.rating} size={13} />
            </View>
            {r.comment ? (
              <Text tone="secondary">{r.comment}</Text>
            ) : (
              <Text tone="muted" style={{ fontStyle: 'italic' }}>
                Yorum yazılmadan puan verildi.
              </Text>
            )}
            {r.reply ? (
              <View style={s.reply}>
                <Text variant="caption" tone="brand">
                  Cevabınız
                </Text>
                <Text tone="secondary">{r.reply}</Text>
              </View>
            ) : null}
            <Button
              title={r.reply ? 'Cevabı düzenle' : 'Cevapla'}
              icon="chatbubble-outline"
              variant={r.reply ? 'ghost' : 'secondary'}
              size="sm"
              onPress={() => open(r)}
            />
          </Card>
        )}
      />
      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title="Yoruma cevap"
        subtitle={editing ? `${editing.customer_name} · ${'★'.repeat(editing.rating)}` : undefined}
        footer={
          <>
            <Button title="Yayınla" icon="send" onPress={() => save(reply)} loading={busy} disabled={!reply.trim()} />
            {editing?.reply ? <Button title="Cevabı kaldır" variant="dangerGhost" onPress={() => save('')} disabled={busy} /> : null}
          </>
        }>
        {editing?.comment ? <Text tone="secondary">“{editing.comment}”</Text> : null}
        <Field
          label="Cevabınız"
          placeholder="Teşekkür edin veya yaşanan sorunu açıklayın."
          value={reply}
          onChangeText={setReply}
          multiline
          maxLength={1000}
          hint="Herkese açık görünür."
        />
        {error ? (
          <Text variant="label" tone="danger">
            {error}
          </Text>
        ) : null}
      </Sheet>
    </View>
  );
}

function Stars({ value, size }: { value: number; size: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value} yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name="star" size={size} color={i <= value ? colors.gold : colors.surface3} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  reply: { gap: 2, paddingLeft: 10, paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: colors.brandLine },
});
