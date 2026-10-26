import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Glow } from '@/components/brand';
import { HoldButton } from '@/components/hold-button';
import { InboxBell } from '@/components/inbox-bell';
import { RevealCell } from '@/components/motion';
import { ReschedulePicker } from '@/components/reschedule-picker';
import { ReviewSheet } from '@/components/review-sheet';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { TopBar, useScrollY } from '@/components/top-bar';
import { Badge, Button, Card, Empty, ScreenHeader, Segmented, Skeleton, StatusBadge, styles, Text } from '@/components/ui';
import { STATUS } from '@/lib/constants';
import { errorMessage, formatDate, formatPrice, formatTime, mapsLink, relativeDay, dayOf, shortDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Appointment } from '@/lib/types';

type Row = Appointment & {
  businesses: { name: string; slug: string; phone: string; address: string; district: string; city: string } | null;
};

/** header: sekmedeki büyük başlık; ayrı ekranda (randevularim.tsx) başlığı yığın çubuğu gösterir. */
export function CustomerAppointments({ userId, header = true }: { userId: string; header?: boolean }) {
  const toast = useToast();
  const channelId = useId();
  const { y, scroll } = useScrollY();
  const [lists, setLists] = useState<{ upcoming: Row[]; past: Row[] } | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  // Değerlendirilebilecek randevular: tamamlanan veya saati geçmiş onaylı, henüz değerlendirilmemiş.
  const [reviewable, setReviewable] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [moving, setMoving] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: reviews }] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, businesses(name, slug, phone, address, district, city)')
        .eq('customer_id', userId)
        .order('starts_at', { ascending: false })
        .limit(100),
      supabase.from('reviews').select('appointment_id').eq('customer_id', userId),
    ]);
    const reviewed = new Set((reviews ?? []).map((r: { appointment_id: string }) => r.appointment_id));
    const rows = (data ?? []) as Row[];
    const now = new Date().toISOString();
    setReviewable(
      new Set(
        rows
          .filter((r) => !reviewed.has(r.id) && (r.status === 'completed' || (r.status === 'confirmed' && r.ends_at <= now)))
          .map((r) => r.id),
      ),
    );
    const isUpcoming = (r: Row) => r.starts_at >= now && ['pending', 'confirmed'].includes(r.status);
    setLists({ upcoming: rows.filter(isUpcoming).reverse(), past: rows.filter((r) => !isUpcoming(r)) });
    setRefreshing(false);
  }, [userId]);

  // Sekmeye her dönüşte tazele (yeni alınan randevu görünsün).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // İşletme onaylayınca veya iptal edince liste anında güncellenir. Kanal adı ekran başına ayrı: aynı adla ikinci
  // kanal kurulamaz (Supabase hata fırlatır), ekran iki kez açık olsa da çakışmasın.
  useEffect(() => {
    const channel = supabase
      .channel(`customer-appointments-${userId}-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `customer_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load, channelId]);

  // Onay penceresi yok: karttaki düğme basılı tutulunca birkaç saniye geri alınabilir, sonra burası çalışır.
  async function cancel(row: Row) {
    const { error } = await supabase.rpc('cancel_appointment', { p_id: row.id });
    if (error) toast(errorMessage(error), 'error');
    else toast('Randevu iptal edildi.');
    load();
  }

  const data = lists ? lists[tab] : [];

  return (
    <View style={styles.screen}>
      <Glow />
      <FlatList
        data={data}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        {...scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface2}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 4 }}>
            {header && <ScreenHeader title="Randevularım" right={<InboxBell />} />}
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'upcoming', label: 'Yaklaşan', count: lists?.upcoming.length },
                { value: 'past', label: 'Geçmiş' },
              ]}
            />
          </View>
        }
        ListEmptyComponent={
          lists === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={130} />
              <Skeleton height={130} />
            </View>
          ) : tab === 'upcoming' ? (
            <Empty icon="calendar-outline" title="Yaklaşan randevunuz yok" text="Keşfet’ten bir işletme seçip birkaç dokunuşla randevu alabilirsiniz.">
              <Button title="Randevu al" icon="compass-outline" onPress={() => router.navigate('/')} />
            </Empty>
          ) : (
            <Empty icon="time-outline" title="Geçmiş randevu yok" text="Tamamlanan ve iptal edilen randevularınız burada görünür." />
          )
        }
        CellRendererComponent={RevealCell}
        renderItem={({ item }) => (
          <AppointmentCard
            item={item}
            upcoming={tab === 'upcoming'}
            canReview={reviewable.has(item.id)}
            onCancel={() => cancel(item)}
            onReschedule={() => setMoving(item)}
            onReview={() => setReviewing(item)}
          />
        )}
      />
      {header && <TopBar y={y} title="Randevularım" />}
      <ReviewSheet
        appointment={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          toast('Teşekkürler! Yorumunuz yayınlandı.');
          load();
        }}
      />
      <Sheet
        visible={!!moving}
        onClose={() => setMoving(null)}
        title="Saati değiştir"
        subtitle={moving ? `${moving.businesses?.name ?? ''} · şu an ${relativeDay(dayOf(moving.starts_at))} ${formatTime(moving.starts_at)}` : undefined}>
        {moving && (
          <ReschedulePicker
            appointment={moving}
            onDone={(t) => {
              setMoving(null);
              toast(`Randevunuz ${formatDate(dayOf(t), false)} ${formatTime(t)} saatine alındı.`);
              load();
            }}
          />
        )}
      </Sheet>
    </View>
  );
}

function AppointmentCard({
  item,
  upcoming,
  canReview,
  onCancel,
  onReschedule,
  onReview,
}: {
  item: Row;
  upcoming: boolean;
  canReview: boolean;
  onCancel: () => unknown;
  onReschedule: () => void;
  onReview: () => void;
}) {
  const b = item.businesses;
  const d = shortDay(dayOf(item.starts_at));
  const open = () => {
    if (b) router.push({ pathname: '/isletme/[slug]', params: { slug: b.slug } });
  };
  // "Tekrar al": işletme sayfası önceki hizmet ve personel seçili açılır.
  const rebook = () => {
    if (b) router.push({ pathname: '/isletme/[slug]', params: { slug: b.slug, service: item.service_id ?? '', staff: item.staff_id ?? '' } });
  };
  const place = b ? [b.address, b.district, b.city].filter(Boolean).join(', ') : '';
  return (
    // Kartın tamamı değil üst kısmı dokunulabilir; iç içe düğme ekran okuyucuda butonları gizler.
    <Card style={[{ gap: 14 }, item.status === 'cancelled' && { opacity: 0.6 }]}>
      <Pressable onPress={open} disabled={!b} accessibilityRole="button" accessibilityLabel={b?.name} style={{ flexDirection: 'row', gap: 14 }}>
        <View style={[s.date, upcoming && s.dateOn]}>
          <Text variant="caption" style={{ color: upcoming ? colors.brand200 : colors.ink3 }}>
            {d.month}
          </Text>
          <Text variant="title" style={{ color: upcoming ? colors.ink : colors.ink2 }}>{d.date}</Text>
          <Text variant="caption" style={{ color: upcoming ? colors.brand200 : colors.ink3 }}>
            {d.weekday}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading" numberOfLines={1}>
            {b?.name ?? 'İşletme'}
          </Text>
          <Text tone="secondary" numberOfLines={1}>
            {relativeDay(dayOf(item.starts_at))} · <Text variant="bodyStrong">{formatTime(item.starts_at)}</Text>
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {item.service_name}
            {Number(item.price) > 0 ? ` · ${formatPrice(item.price)}` : ''}
          </Text>
          <View style={{ marginTop: 2 }}>
            {item.rejected ? (
              <Badge label="Onaylanmadı" icon={STATUS.cancelled.icon} fg={STATUS.cancelled.fg} bg={STATUS.cancelled.bg} />
            ) : (
              <StatusBadge status={item.status} />
            )}
          </View>
        </View>
      </Pressable>
      {item.status === 'cancelled' && item.cancel_reason ? (
        <Text variant="caption" tone="secondary">
          İşletmenin açıklaması: {item.cancel_reason}
        </Text>
      ) : null}
      {upcoming ? (
        <View style={{ gap: 8 }}>
          {place || b?.phone ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {place ? (
                <Button title="Yol tarifi" icon="navigate-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(mapsLink(`${b?.name ?? ''} ${place}`))} />
              ) : null}
              {b?.phone ? (
                <Button title="Ara" icon="call-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${b.phone}`)} />
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {item.service_id ? (
              <Button title="Saati değiştir" icon="time-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={onReschedule} />
            ) : null}
            <HoldButton title="İptal" pending="İptal ediliyor" icon="close" style={{ flex: 1 }} onConfirm={onCancel} />
          </View>
        </View>
      ) : (
        b && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Tekrar al" icon="repeat-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={rebook} />
            {canReview && <Button title="Değerlendir" icon="star-outline" size="sm" style={{ flex: 1 }} onPress={onReview} />}
          </View>
        )
      )}
      {upcoming && item.status === 'pending' && (
        <View style={styles.rowCenter}>
          <Ionicons name="hourglass-outline" size={14} color={colors.warning} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            İşletme onayladığında kesinleşecek.
          </Text>
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  date: {
    width: 60,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dateOn: { backgroundColor: colors.brandTint, borderColor: colors.brandLine },
});
