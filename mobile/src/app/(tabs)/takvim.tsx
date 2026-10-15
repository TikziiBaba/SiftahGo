import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppointmentSheet, FlaggedNote, type AgendaRow } from '@/components/appointment-sheet';
import { Glow } from '@/components/brand';
import { InboxBell } from '@/components/inbox-bell';
import { CalendarSheet } from '@/components/pickers';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Empty, IconButton, ScreenHeader, SectionTitle, Skeleton, Stat, StatusBadge, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSubscribed, isTrial, STATUS, WEEKDAYS } from '@/lib/constants';
import { addDays, dayBounds, dayOf, errorMessage, formatDate, formatPrice, formatTime, isoWeekday, relativeDay, shortDay, todayStr } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { daysLeft } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadows } from '@/lib/theme';
import type { AppointmentStatus, Business } from '@/lib/types';

export default function CalendarTab() {
  const { business } = useAuth();
  return business ? <Agenda business={business} /> : null;
}

function Agenda({ business }: { business: Business }) {
  const toast = useToast();
  // Bildirime dokunulunca randevunun günü açılır (sekme zaten açıksa da).
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(() => dayParam ?? todayStr());
  const [lastDayParam, setLastDayParam] = useState(dayParam);
  if (dayParam !== lastDayParam) {
    setLastDayParam(dayParam);
    if (dayParam) setDay(dayParam);
  }
  const [rows, setRows] = useState<{ day: string; list: AgendaRow[] } | null>(null);
  const [pending, setPending] = useState<AgendaRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AgendaRow | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const subscribed = isSubscribed(business);
  const left = daysLeft(business.subscription_ends_at);
  const trial = isTrial(business);
  const weekStart = addDays(day, 1 - isoWeekday(day));
  const list = rows?.day === day ? rows.list : null;

  const load = useCallback(async () => {
    const { from, to } = dayBounds(day);
    const [a, p, w] = await Promise.all([
      supabase.from('appointments').select('*, staff(name)').eq('business_id', business.id).gte('starts_at', from).lt('starts_at', to).order('starts_at'),
      supabase
        .from('appointments')
        .select('*, staff(name)')
        .eq('business_id', business.id)
        .eq('status', 'pending')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(20),
      // Hafta şeridindeki noktalar için
      supabase
        .from('appointments')
        .select('starts_at')
        .eq('business_id', business.id)
        .in('status', ['pending', 'confirmed', 'completed'])
        .gte('starts_at', dayBounds(weekStart).from)
        .lt('starts_at', dayBounds(addDays(weekStart, 6)).to),
    ]);
    const perDay: Record<string, number> = {};
    for (const r of (w.data ?? []) as { starts_at: string }[]) perDay[dayOf(r.starts_at)] = (perDay[dayOf(r.starts_at)] ?? 0) + 1;
    setRows({ day, list: (a.data ?? []) as AgendaRow[] });
    setPending((p.data ?? []) as AgendaRow[]);
    setCounts(perDay);
    setRefreshing(false);
  }, [business.id, day, weekStart]);

  // Ekrana her dönüşte (ör. randevu ekledikten sonra) tazele.
  useFocusEffect(
    useCallback(() => {
      if (subscribed) load();
    }, [load, subscribed]),
  );

  // Yeni randevu geldiğinde veya değiştiğinde listeyi yenile.
  useEffect(() => {
    if (!subscribed) return;
    const channel = supabase
      .channel(`mobile-appointments-${business.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${business.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [business.id, load, subscribed]);

  async function quickStatus(id: string, status: AppointmentStatus, name: string) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) return toast(errorMessage(error), 'error');
    toast(`${name}: ${STATUS[status].label}`);
    load();
  }

  function pickDay(d: string) {
    haptic.select();
    setDay(d);
  }

  const rel = relativeDay(day);
  const isRel = ['Bugün', 'Yarın', 'Dün'].includes(rel);
  const header = (
    <ScreenHeader
      eyebrow={business.name}
      title={isRel ? rel : formatDate(day, false)}
      subtitle={isRel ? formatDate(day) : WEEKDAYS[isoWeekday(day) - 1]}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <InboxBell />
          {subscribed && (
            <>
              <IconButton icon="calendar-outline" label="Takvimden gün seç" onPress={() => setCalendarOpen(true)} />
              <IconButton
                icon="add"
                label="Randevu ekle"
                color={colors.brandInk}
                onPress={() => router.push({ pathname: '/randevu-ekle', params: { day } })}
                style={{ backgroundColor: colors.brand, borderColor: colors.brand }}
              />
            </>
          )}
        </View>
      }
    />
  );

  if (!subscribed) {
    return (
      <View style={styles.screen}>
        <Glow />
        <View style={styles.content}>
          {header}
          <Empty
            icon="sparkles-outline"
            title="Aktif paketiniz yok"
            text="Paket seçene kadar sayfanız yayında görünmez ve randevu alınamaz. Bu sırada işletme bilgilerinizi doldurabilirsiniz.">
            <Button title="Paketleri gör" onPress={() => router.push('/yonetim/abonelik')} />
            <Button title="İşletme bilgilerini doldur" variant="secondary" onPress={() => router.push('/yonetim/bilgiler')} />
          </Empty>
        </View>
      </View>
    );
  }

  const active = (list ?? []).filter((r) => r.status !== 'cancelled');
  const revenue = active.filter((r) => r.status !== 'no_show').reduce((sum, r) => sum + Number(r.price), 0);
  const today = todayStr();

  return (
    <View style={styles.screen}>
      <Glow />
      <FlatList
        data={list ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
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
          <View style={{ gap: 12 }}>
            {header}
            {day !== today && (
              <Pressable onPress={() => pickDay(today)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <Text variant="label" tone="brand">
                  ← Bugüne dön
                </Text>
              </Pressable>
            )}

            {business.is_suspended && (
              <Banner tone="danger" icon="alert-circle-outline" text="İşletmeniz yönetici tarafından yayından kaldırıldı; sayfanız görünmüyor ve randevu alınamıyor." />
            )}
            {trial ? (
              <Banner
                icon="sparkles-outline"
                text={`Ücretsiz Pro denemenizin bitmesine ${left} gün kaldı. Sayfanız yayında kalsın diye paket seçin.`}
                onPress={() => router.push('/yonetim/abonelik')}
              />
            ) : left <= 5 && (
              <Banner
                tone="warning"
                icon="time-outline"
                text={`Aboneliğinizin bitmesine ${left} gün kaldı. Kesintisiz devam etmek için yenileyin.`}
                onPress={() => router.push('/yonetim/abonelik')}
              />
            )}

            <View style={s.week}>
              <IconButton icon="chevron-back" label="Önceki hafta" size={30} onPress={() => pickDay(addDays(day, -7))} />
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
                const sd = shortDay(d);
                const on = d === day;
                return (
                  <Pressable
                    key={d}
                    onPress={() => pickDay(d)}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDate(d)}, ${counts[d] ?? 0} randevu`}
                    accessibilityState={{ selected: on }}
                    style={[s.weekDay, on && s.weekDayOn]}>
                    <Text variant="caption" style={{ color: on ? colors.brandInk : colors.ink3 }}>
                      {sd.weekday}
                    </Text>
                    <Text variant="heading" style={{ fontFamily: fonts.bold, color: on ? colors.brandInk : d === today ? colors.brand300 : colors.ink }}>
                      {sd.date}
                    </Text>
                    <View style={[s.dot, { opacity: counts[d] ? 1 : 0, backgroundColor: on ? colors.brandInk : colors.brand }]} />
                  </Pressable>
                );
              })}
              <IconButton icon="chevron-forward" label="Sonraki hafta" size={30} onPress={() => pickDay(addDays(day, 7))} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label="Randevu" value={list ? String(active.length) : '–'} icon="calendar-outline" />
              <Stat label="Ciro" value={list ? formatPrice(revenue) : '–'} icon="cash-outline" />
              <Stat label="Bekleyen" value={String(pending.length)} icon="hourglass-outline" />
            </View>

            {pending.length > 0 && (
              <>
                <SectionTitle title={`Onay bekleyenler · ${pending.length}`} />
                {pending.map((r) => (
                  // Kartın tamamı değil başlığı dokunulabilir; iç içe düğme ekran okuyucuda butonları gizler.
                  <Card key={r.id} style={[{ gap: 12 }, s.pending]}>
                    <Pressable onPress={() => setSelected(r)} accessibilityRole="button" accessibilityLabel={`${r.customer_name}, onay bekliyor, ayrıntılar`} style={{ gap: 3 }}>
                      <Text variant="bodyStrong">{r.customer_name}</Text>
                      <Text variant="caption" tone="muted">
                        {relativeDay(dayOf(r.starts_at))} · {formatTime(r.starts_at)} · {r.service_name}
                      </Text>
                      <FlaggedNote row={r} />
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Onayla" icon="checkmark" size="sm" style={{ flex: 1 }} onPress={() => quickStatus(r.id, 'confirmed', r.customer_name)} />
                      <Button title="Reddet" variant="dangerGhost" size="sm" style={{ flex: 1 }} onPress={() => setSelected(r)} />
                    </View>
                  </Card>
                ))}
              </>
            )}

            <SectionTitle title={list && list.length ? `Randevular · ${list.length}` : 'Randevular'} />
          </View>
        }
        ListEmptyComponent={
          list === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={84} />
              <Skeleton height={84} />
            </View>
          ) : (
            <Empty icon="cafe-outline" title="Bu gün boş" text="Telefonla veya dükkânda alınan randevuları da buradan ekleyebilirsiniz.">
              <Button title="Randevu ekle" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/randevu-ekle', params: { day } })} />
            </Empty>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(item)}
            accessibilityRole="button"
            accessibilityLabel={`${formatTime(item.starts_at)} ${item.customer_name}, ${STATUS[item.status].label}`}
            style={({ pressed }) => [s.item, pressed && { opacity: 0.8 }]}>
            <View style={s.time}>
              <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                {formatTime(item.starts_at)}
              </Text>
              <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {formatTime(item.ends_at)}
              </Text>
            </View>
            <View style={[s.itemCard, { borderLeftColor: STATUS[item.status].fg }, item.status === 'cancelled' && { opacity: 0.5 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {item.customer_name}
                </Text>
                <StatusBadge status={item.status} />
              </View>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {item.service_name}
                {item.staff ? ` · ${item.staff.name}` : ''} · {formatPrice(item.price)}
              </Text>
              <FlaggedNote row={item} />
              {item.note ? (
                <Text variant="caption" tone="secondary" numberOfLines={1} style={{ fontStyle: 'italic' }}>
                  “{item.note}”
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />

      <AppointmentSheet
        appointment={selected}
        businessName={business.name}
        onClose={() => setSelected(null)}
        onChanged={(message) => {
          setSelected(null);
          toast(message);
          load();
        }}
      />
      <CalendarSheet key={day} visible={calendarOpen} onClose={() => setCalendarOpen(false)} title="Gün seçin" value={day} onSelect={setDay} />
    </View>
  );
}

const s = StyleSheet.create({
  week: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  weekDayOn: { backgroundColor: colors.brand, boxShadow: shadows.brandSm },
  dot: { width: 5, height: 5, borderRadius: 3 },
  pending: { borderColor: colors.warningLine, backgroundColor: colors.warningSoft },
  item: { flexDirection: 'row', gap: 12 },
  time: { width: 52, paddingTop: 12, alignItems: 'flex-end' },
  itemCard: {
    flex: 1,
    gap: 4,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
  },
});
