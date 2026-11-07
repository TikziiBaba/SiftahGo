import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { KeyboardScreen } from '@/components/keyboard-screen';
import { Badge, Banner, Button, Card, IconButton, Skeleton, Stat, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, dayBounds, dayOf, errorMessage, formatPrice, formatTime, MONTHS, relativeDay, todayStr } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { AppointmentStatus, Business, PaymentMethod, StaffCommission } from '@/lib/types';
import { WEB_URL, type IconName } from '@/lib/constants';
import * as WebBrowser from 'expo-web-browser';

type Row = {
  id: string;
  starts_at: string;
  customer_name: string;
  service_name: string;
  price: number;
  status: AppointmentStatus;
  payment_method: PaymentMethod | null;
  paid_amount: number | null;
  staff_id: string | null;
  staff: { name: string } | null;
};

// Web ile aynı (web/src/app/panel/kasa/page.tsx)
const METHODS: { id: PaymentMethod; label: string; icon: IconName }[] = [
  { id: 'cash', label: 'Nakit', icon: 'cash-outline' },
  { id: 'card', label: 'Kart', icon: 'card-outline' },
  { id: 'transfer', label: 'Havale', icon: 'business-outline' },
];

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const nextMonth = (day: string) => {
  const [y, m] = day.slice(0, 7).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};

function sum(rows: Row[]) {
  const by: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 };
  for (const r of rows) if (r.payment_method) by[r.payment_method] += Number(r.paid_amount ?? 0);
  return { ...by, total: by.cash + by.card + by.transfer };
}

export default function CashScreen() {
  const { business } = useAuth();
  return business ? <Cash business={business} /> : null;
}

/** Kasa: günün randevularına ödeme işlenir; gün sonu, ay toplamı ve personel primi. */
function Cash({ business }: { business: Business }) {
  const [day, setDay] = useState(todayStr);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rates, setRates] = useState<StaffCommission[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const month = monthStart(day);

  const load = useCallback(async () => {
    const [{ data, error }, { data: c }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, starts_at, customer_name, service_name, price, status, payment_method, paid_amount, staff_id, staff(name)')
        .eq('business_id', business.id)
        .gte('starts_at', dayBounds(month).from)
        .lt('starts_at', dayBounds(nextMonth(month)).from)
        .neq('status', 'cancelled')
        .order('starts_at'),
      supabase.from('staff_commissions').select('*').eq('business_id', business.id),
    ]);
    if (error) return setError(errorMessage(error));
    setRows((data ?? []) as unknown as Row[]);
    setRates((c ?? []) as StaffCommission[]);
  }, [business.id, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ay değişince kayıtlar yeniden okunur (web ile aynı)
    load();
  }, [load]);

  const list = rows?.filter((r) => dayOf(r.starts_at) === day && r.status !== 'no_show') ?? [];
  const daySum = sum(list);
  const monthSum = sum(rows ?? []);
  const unpaid = list.filter((r) => !r.payment_method && new Date(r.starts_at) <= new Date());

  async function pay(r: Row, method: PaymentMethod | null, amount?: number) {
    setError('');
    const past = new Date(r.starts_at) <= new Date();
    const { error } = await supabase
      .from('appointments')
      .update({
        payment_method: method,
        paid_amount: method ? (amount ?? r.price) : null,
        // Saati geçmiş randevunun ödemesi alındıysa gelmiş demektir.
        ...(method && past && (r.status === 'confirmed' || r.status === 'pending') && { status: 'completed' }),
      })
      .eq('id', r.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  async function saveRate(staffId: string, value: string) {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) return setError('Prim oranı 0 ile 100 arasında olmalı.');
    const { error } = await supabase.from('staff_commissions').upsert({ staff_id: staffId, business_id: business.id, percent: n });
    if (error) return setError(errorMessage(error));
    load();
  }

  const staff = new Map<string, { name: string; revenue: number; count: number }>();
  for (const r of rows ?? []) {
    if (!r.staff_id || !r.payment_method) continue;
    const s = staff.get(r.staff_id) ?? { name: r.staff?.name ?? 'Personel', revenue: 0, count: 0 };
    s.revenue += Number(r.paid_amount ?? 0);
    s.count++;
    staff.set(r.staff_id, s);
  }

  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand300}
          />
        }>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="chevron-back" label="Önceki gün" onPress={() => setDay(addDays(day, -1))} />
          <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>
            {relativeDay(day)}
          </Text>
          <IconButton icon="chevron-forward" label="Sonraki gün" onPress={() => setDay(addDays(day, 1))} />
        </View>

        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Gün toplamı" value={formatPrice(daySum.total)} icon="wallet-outline" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {METHODS.map((m) => (
            <Stat key={m.id} label={m.label} value={formatPrice(daySum[m.id])} />
          ))}
        </View>
        {unpaid.length > 0 && (
          <Banner
            tone="warning"
            icon="alert-circle-outline"
            text={`Saati geçmiş ${unpaid.length} randevunun ödemesi girilmedi (${formatPrice(unpaid.reduce((s, r) => s + Number(r.price), 0))}).`}
          />
        )}

        {rows === null ? (
          <Skeleton height={120} />
        ) : list.length === 0 ? (
          <Text tone="muted" style={{ textAlign: 'center', paddingVertical: 16 }}>
            Bu gün randevu yok.
          </Text>
        ) : (
          list.map((r) => <PayRow key={r.id} row={r} onPay={pay} />)
        )}

        <Card style={{ gap: 6 }}>
          <Text variant="bodyStrong">
            {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)} toplamı
          </Text>
          <Text variant="title">{formatPrice(monthSum.total)}</Text>
          {METHODS.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text tone="muted">{m.label}</Text>
              <Text>{formatPrice(monthSum[m.id])}</Text>
            </View>
          ))}
          {/* Dosya paylaşımı yerel modül ister (yeni APK); döküm web panelden indirilir. */}
          <Button
            title="Excel dökümü (web panel)"
            icon="download-outline"
            variant="secondary"
            size="sm"
            onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/panel/kasa?ay=${month.slice(0, 7)}`)}
          />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="bodyStrong">Personel primi (bu ay)</Text>
          <Text variant="caption" tone="muted">
            Ödemesi girilen randevuların cirosu üzerinden hesaplanır. Oranlar yalnızca size görünür.
          </Text>
          {staff.size === 0 ? (
            <Text tone="muted">Bu ay personele bağlı ödeme yok.</Text>
          ) : (
            [...staff.entries()].map(([id, s]) => {
              const rate = Number(rates.find((x) => x.staff_id === id)?.percent ?? 0);
              return (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{s.name}</Text>
                    <Text variant="caption" tone="muted">
                      {s.count} iş · {formatPrice(s.revenue)}
                    </Text>
                  </View>
                  <Text tone="muted">%</Text>
                  <TextInput
                    key={`${id}-${rate}`}
                    defaultValue={String(rate)}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`${s.name} prim oranı`}
                    onEndEditing={(e) => Number(e.nativeEvent.text) !== rate && saveRate(id, e.nativeEvent.text)}
                    style={input}
                  />
                  <Text variant="bodyStrong" style={{ minWidth: 70, textAlign: 'right' }}>
                    {formatPrice((s.revenue * rate) / 100)}
                  </Text>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </KeyboardScreen>
  );
}

const input = {
  width: 56,
  paddingVertical: 6,
  paddingHorizontal: 8,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.line,
  color: colors.ink,
  textAlign: 'right' as const,
};

function PayRow({ row, onPay }: { row: Row; onPay: (r: Row, m: PaymentMethod | null, amount?: number) => Promise<void> }) {
  const [amount, setAmount] = useState(String(Number(row.price)));
  const [busy, setBusy] = useState(false);
  const paid = METHODS.find((m) => m.id === row.payment_method);
  const run = async (m: PaymentMethod | null) => {
    const n = Number(amount.replace(',', '.'));
    if (m && (!Number.isFinite(n) || n < 0)) return;
    setBusy(true);
    await onPay(row, m, n);
    setBusy(false);
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="bodyStrong">{formatTime(row.starts_at)}</Text>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {row.customer_name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[row.service_name, row.staff?.name].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {paid && <Badge label={`${paid.label} · ${formatPrice(Number(row.paid_amount))}`} icon={paid.icon} fg={colors.success} bg={colors.successTint} />}
      </View>
      {paid ? (
        <Button title="Ödemeyi geri al" icon="arrow-undo-outline" variant="ghost" size="sm" disabled={busy} onPress={() => run(null)} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" accessibilityLabel="Tutar" style={[input, { width: 70 }]} />
          {METHODS.map((m) => (
            <Button key={m.id} title={m.label} variant="secondary" size="sm" disabled={busy} style={{ flex: 1 }} onPress={() => run(m.id)} />
          ))}
        </View>
      )}
    </Card>
  );
}
