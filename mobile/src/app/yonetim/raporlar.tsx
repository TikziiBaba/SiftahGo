import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PlanGate } from '@/components/plan-gate';
import { Card, Chip, LoadError, Skeleton, Stat, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { STATUS, WEEKDAYS } from '@/lib/constants';
import { addDays, dayBounds, dayOf, formatDate, formatPrice, formatTime, isoWeekday, phoneKey, todayStr } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { AppointmentStatus, Business, ReportSummary } from '@/lib/types';

type Row = {
  starts_at: string;
  created_at: string;
  status: AppointmentStatus;
  price: number;
  service_name: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  staff: { name: string } | null;
};

// Web ile aynı dönemler ve hesap (web/src/app/panel/raporlar/page.tsx)
const PERIODS = [
  { id: '7', label: 'Son 7 gün' },
  { id: '30', label: 'Son 30 gün' },
  { id: 'month', label: 'Bu ay' },
  { id: 'last-month', label: 'Geçen ay' },
  { id: '90', label: 'Son 90 gün' },
] as const;

function range(period: string) {
  const today = todayStr();
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === 'last-month') {
    const lastPrev = addDays(`${today.slice(0, 8)}01`, -1);
    return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
  }
  return { from: addDays(today, -(Number(period) - 1)), to: today };
}

// İptal ve gelmeyenler ciroya sayılmaz.
const counts = (r: Row) => r.status !== 'cancelled' && r.status !== 'no_show';

export default function ReportsScreen() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <View style={styles.screen}>
      <PlanGate business={business} feature="reports" title="Raporlar">
        <Reports business={business} />
      </PlanGate>
    </View>
  );
}

function Reports({ business }: { business: Business }) {
  const [period, setPeriod] = useState<string>('30');
  const [result, setResult] = useState<{ period: string; rows: Row[]; summary: ReportSummary | null } | null>(null);
  // Yüklenemeyen dönem ve "Tekrar dene" sayacı
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { from, to } = range(period);
  const rows = result?.period === period ? result.rows : null;
  const summary = result?.period === period ? result.summary : null;

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from('appointments')
        .select('starts_at, created_at, status, price, service_name, customer_id, customer_name, customer_phone, staff(name)')
        .eq('business_id', business.id)
        .gte('starts_at', dayBounds(from).from)
        .lt('starts_at', dayBounds(to).to)
        .limit(5000),
      supabase.rpc('get_report_summary', { p_business_id: business.id, p_from: from, p_to: to }),
    ]).then(([{ data, error }, { data: summaryData }]) => {
      if (!active) return;
      if (error) return setFailed(period);
      setFailed(null);
      setResult({ period, rows: (data ?? []) as unknown as Row[], summary: (summaryData ?? null) as ReportSummary | null });
    });
    return () => {
      active = false;
    };
  }, [business.id, period, from, to, attempt]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const valid = rows.filter(counts);
    const completed = rows.filter((r) => r.status === 'completed').length;
    const noShow = rows.filter((r) => r.status === 'no_show').length;
    const revenue = valid.reduce((sum, r) => sum + Number(r.price), 0);

    const days: { day: string; revenue: number; count: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push({ day: d, revenue: 0, count: 0 });
    for (const r of valid) {
      const slot = days.find((x) => x.day === dayOf(r.starts_at));
      if (slot) {
        slot.revenue += Number(r.price);
        slot.count += 1;
      }
    }

    const group = (key: (r: Row) => string) => {
      const map = new Map<string, { name: string; count: number; revenue: number }>();
      for (const r of valid) {
        const name = key(r);
        const g = map.get(name) ?? { name, count: 0, revenue: 0 };
        g.count += 1;
        g.revenue += Number(r.price);
        map.set(name, g);
      }
      return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
    };

    // En değerli müşteriler: aynı telefon tek kişi sayılır (web ile aynı).
    const customers = new Map<string, { name: string; count: number; revenue: number }>();
    for (const r of valid) {
      const k = phoneKey(r.customer_phone) || r.customer_name;
      const g = customers.get(k) ?? { name: r.customer_name, count: 0, revenue: 0 };
      g.count += 1;
      g.revenue += Number(r.price);
      customers.set(k, g);
    }

    // Gün (1-7) ve saate göre randevu sayısı
    const heat = new Map<string, number>();
    for (const r of valid) {
      const key = `${isoWeekday(dayOf(r.starts_at))}-${Number(formatTime(r.starts_at).slice(0, 2))}`;
      heat.set(key, (heat.get(key) ?? 0) + 1);
    }

    // Online randevuların ne kadar önceden alındığı
    const lead = [
      { name: '2 saatten az', count: 0 },
      { name: 'Aynı gün', count: 0 },
      { name: '1–3 gün', count: 0 },
      { name: '3–7 gün', count: 0 },
      { name: '1 haftadan fazla', count: 0 },
    ];
    for (const r of rows.filter((x) => x.customer_id)) {
      const h = (new Date(r.starts_at).getTime() - new Date(r.created_at).getTime()) / 36e5;
      lead[h < 2 ? 0 : h < 24 ? 1 : h < 72 ? 2 : h < 168 ? 3 : 4].count += 1;
    }

    return {
      customers: [...customers.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6),
      heat,
      lead,
      statuses: (Object.keys(STATUS) as AppointmentStatus[]).map((st) => ({ name: STATUS[st].label, count: rows.filter((r) => r.status === st).length, color: STATUS[st].fg })),
      revenue,
      count: valid.length,
      average: valid.length ? revenue / valid.length : 0,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
      noShowRate: completed + noShow ? Math.round((noShow / (completed + noShow)) * 100) : 0,
      days,
      byService: group((r) => r.service_name),
      byStaff: group((r) => r.staff?.name ?? 'Atanmamış'),
    };
  }, [rows, from, to]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
        {PERIODS.map((p) => (
          <Chip key={p.id} label={p.label} selected={period === p.id} onPress={() => setPeriod(p.id)} />
        ))}
      </ScrollView>
      <Text variant="caption" tone="muted">
        {formatDate(from, false)} – {formatDate(to, false)} · iptal ve gelmeyenler ciroya dahil değil
      </Text>

      {failed === period && !stats ? (
        <LoadError onRetry={() => setAttempt((n) => n + 1)} />
      ) : !stats ? (
        <>
          <Skeleton height={180} />
          <Skeleton height={220} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Ciro" value={formatPrice(stats.revenue)} icon="cash-outline" />
            <Stat label="Randevu" value={String(stats.count)} icon="calendar-outline" />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Ortalama sepet" value={formatPrice(stats.average)} icon="pricetag-outline" />
            <Stat label="Gelmeme oranı" value={`%${stats.noShowRate}`} hint={`${stats.cancelled} iptal`} icon="ban-outline" />
          </View>
          {summary && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat
                label="Doluluk"
                value={`%${summary.capacity_minutes ? Math.round((summary.booked_minutes / summary.capacity_minutes) * 100) : 0}`}
                hint="Personel saatlerinin dolu kısmı"
                icon="time-outline"
              />
              <Stat
                label="Geri dönen"
                value={`%${summary.customers ? Math.round((summary.returning / summary.customers) * 100) : 0}`}
                hint={`${summary.customers} müşteriden ${summary.returning} kişi`}
                icon="repeat-outline"
              />
            </View>
          )}
          <DailyChart days={stats.days} />
          <Breakdown title="Hizmetlere göre" items={stats.byService} />
          <Breakdown title="Personele göre" items={stats.byStaff} />
          <Breakdown title="En değerli müşteriler" items={stats.customers} />
          <Heatmap heat={stats.heat} />
          <Counts title="Randevu durumları" items={stats.statuses} />
          <Counts title="Ne kadar önceden randevu alınıyor?" items={stats.lead} empty="Bu dönemde online randevu yok." />
        </>
      )}
    </ScrollView>
  );
}

function DailyChart({ days }: { days: { day: string; revenue: number; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const shown = active !== null ? days[active] : null;
  const empty = days.every((d) => d.count === 0);

  return (
    <Card style={{ gap: 12 }}>
      <Text variant="heading">Günlük ciro</Text>
      {empty ? (
        <Text tone="muted" style={{ textAlign: 'center', paddingVertical: 32 }}>
          Bu dönemde randevu yok.
        </Text>
      ) : (
        <>
          <Text variant="label" tone={shown ? 'default' : 'muted'} accessibilityLiveRegion="polite">
            {shown ? `${formatDate(shown.day)} · ${formatPrice(shown.revenue)} · ${shown.count} randevu` : 'Ayrıntı için bir çubuğa dokunun'}
          </Text>
          <View style={s.chart}>
            <View style={s.gridLine} />
            <Text variant="caption" tone="muted" style={s.maxLabel}>
              {formatPrice(max)}
            </Text>
            <View style={s.bars}>
              {days.map((d, i) => (
                <Pressable
                  key={d.day}
                  onPress={() => {
                    haptic.select();
                    setActive(active === i ? null : i);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDate(d.day)}: ${formatPrice(d.revenue)}, ${d.count} randevu`}
                  style={s.barSlot}>
                  <View style={[s.bar, { height: `${(d.revenue / max) * 100}%`, backgroundColor: active === i ? colors.brand300 : colors.brand500 }]} />
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" tone="muted">
              {formatDate(days[0].day, false)}
            </Text>
            <Text variant="caption" tone="muted">
              {formatDate(days[days.length - 1].day, false)}
            </Text>
          </View>
        </>
      )}
    </Card>
  );
}

function Breakdown({ title, items }: { title: string; items: { name: string; count: number; revenue: number }[] }) {
  const max = Math.max(...items.map((i) => i.revenue), 1);
  return (
    <Card style={{ gap: 14 }}>
      <Text variant="heading">{title}</Text>
      {items.length === 0 ? (
        <Text tone="muted">Veri yok.</Text>
      ) : (
        items.slice(0, 8).map((i) => (
          <View key={i.name} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {i.name}
              </Text>
              <Text tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
                {i.count} · <Text variant="bodyStrong">{formatPrice(i.revenue)}</Text>
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${(i.revenue / max) * 100}%` }]} />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

/** Gün ve saate göre yoğunluk: koyu hücre daha çok randevu. */
function Heatmap({ heat }: { heat: Map<string, number> }) {
  const hours = [...heat.keys()].map((k) => Number(k.split('-')[1]));
  const max = Math.max(...heat.values(), 1);
  const first = hours.length ? Math.min(...hours) : 9;
  const last = hours.length ? Math.max(...hours) : 18;
  const range = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="heading">En yoğun gün ve saatler</Text>
        <Text variant="caption" tone="muted">
          Personel planını ve kampanya saatlerini buna göre ayarlayın.
        </Text>
      </View>
      {heat.size === 0 ? (
        <Text tone="muted">Veri yok.</Text>
      ) : (
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            <View style={s.heatDay} />
            {range.map((h) => (
              <Text key={h} variant="caption" tone="muted" style={s.heatHour} numberOfLines={1}>
                {(h - first) % 2 === 0 ? h : ''}
              </Text>
            ))}
          </View>
          {WEEKDAYS.map((name, i) => (
            <View key={name} style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <Text variant="caption" tone="muted" style={s.heatDay}>
                {name.slice(0, 3)}
              </Text>
              {range.map((h) => {
                const c = heat.get(`${i + 1}-${h}`) ?? 0;
                return (
                  <View
                    key={h}
                    accessible
                    accessibilityLabel={`${name} ${h}.00, ${c} randevu`}
                    style={[s.heatCell, c ? { backgroundColor: colors.brand, opacity: 0.25 + 0.75 * (c / max) } : null]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function Counts({ title, items, empty = 'Veri yok.' }: { title: string; items: { name: string; count: number; color?: string }[]; empty?: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <Card style={{ gap: 14 }}>
      <Text variant="heading">{title}</Text>
      {items.every((i) => i.count === 0) ? (
        <Text tone="muted">{empty}</Text>
      ) : (
        items.map((i) => (
          <View key={i.name} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {i.name}
              </Text>
              <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                {i.count}
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${(i.count / max) * 100}%` }, i.color ? { backgroundColor: i.color } : null]} />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  heatDay: { width: 30 },
  heatHour: { flex: 1, textAlign: 'center', fontSize: 10 },
  heatCell: { flex: 1, aspectRatio: 1, borderRadius: 4, backgroundColor: colors.surface2 },
  chart: { height: 170, marginTop: 4 },
  gridLine: { position: 'absolute', top: 0, left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  maxLabel: { position: 'absolute', top: -8, right: 0, backgroundColor: colors.surface, paddingLeft: 4 },
  bars: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: colors.lineStrong },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 0 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.brand500 },
});
