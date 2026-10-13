import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { ReschedulePicker } from '@/components/reschedule-picker';
import { Sheet } from '@/components/sheet';
import { Banner, Button, Card, Chip, StatusBadge, styles, Text } from '@/components/ui';
import { STATUS, type IconName } from '@/lib/constants';
import { dayOf, errorMessage, formatDate, formatPrice, formatTime, isPast, phoneKey, relativeDay, reminderText, whatsappLink } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Appointment, AppointmentStatus, SessionPackage } from '@/lib/types';

export type AgendaRow = Appointment & { staff: { name: string } | null };

/** İşletme sahibi için randevu ayrıntısı: arama, WhatsApp, saat ve durum değiştirme. */
export function AppointmentSheet({
  appointment,
  businessName,
  onClose,
  onChanged,
}: {
  appointment: AgendaRow | null;
  businessName: string;
  onClose: () => void;
  /** Durum değişti; mesaj ekranda gösterilir */
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState<AppointmentStatus | 'block' | null>(null);
  const [error, setError] = useState('');
  // Saat seçimi açık olan randevu; başka randevu açılınca kendiliğinden kapanır.
  const [movingId, setMovingId] = useState<string | null>(null);
  const a = appointment;
  const moving = !!a && movingId === a.id;
  // Müşteri defterindeki not ve seans paketleri (paketinde defter yoksa boş gelir).
  const [extra, setExtra] = useState<{ id: string; note: string; packages: SessionPackage[] } | null>(null);
  const customerNote = a && extra?.id === a.id ? extra.note : '';
  const pkg =
    a && extra?.id === a.id
      ? (extra.packages.find((p) => p.id === a.package_id) ??
        (a.status === 'cancelled' ? undefined : extra.packages.find((p) => p.service_id === a.service_id && p.used < p.total)))
      : undefined;
  const aId = a?.id;
  const aBusiness = a?.business_id;
  const aKey = a ? phoneKey(a.customer_phone) : '';

  useEffect(() => {
    if (!aId || !aBusiness || !aKey) return;
    let active = true;
    Promise.all([
      supabase.from('customer_notes').select('note').eq('business_id', aBusiness).eq('phone_key', aKey).maybeSingle(),
      supabase.from('session_packages').select('*').eq('business_id', aBusiness).eq('phone_key', aKey).order('created_at'),
    ]).then(([{ data }, { data: packages }]) => {
      if (active) setExtra({ id: aId, note: data?.note ?? '', packages: (packages ?? []) as SessionPackage[] });
    });
    return () => {
      active = false;
    };
  }, [aId, aBusiness, aKey]);

  async function setStatus(status: AppointmentStatus) {
    if (!a) return;
    setBusy(status);
    setError('');
    const { error } = await supabase.from('appointments').update({ status }).eq('id', a.id);
    setBusy(null);
    if (error) return setError(errorMessage(error));
    onChanged(`${a.customer_name}: ${STATUS[status].label}`);
  }

  function confirmCancel() {
    Alert.alert('Randevu iptal edilsin mi?', 'Müşteriye e-posta ile bildirilir.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal et', style: 'destructive', onPress: () => setStatus('cancelled') },
    ]);
  }

  // Müşteriyi engeller: sayfadan online randevu alamaz, bu işletmedeki yaklaşan randevuları iptal olur.
  function confirmBlock() {
    if (!a) return;
    Alert.alert(
      `${a.customer_name} engellensin mi?`,
      'Online randevu alamaz ve yaklaşan randevuları iptal edilir. Engeli web panelindeki Ayarlar’dan kaldırabilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: async () => {
            setBusy('block');
            setError('');
            const { error } = await supabase.rpc('block_customer', { p_appointment_id: a.id });
            setBusy(null);
            if (error) return setError(errorMessage(error));
            onChanged(`${a.customer_name} engellendi`);
          },
        },
      ],
    );
  }

  function close() {
    setError('');
    setMovingId(null);
    onClose();
  }

  const active = a && ['pending', 'confirmed'].includes(a.status);

  return (
    <Sheet
      visible={!!a}
      onClose={close}
      title={moving ? 'Saati değiştir' : a?.customer_name}
      subtitle={a ? `${moving ? `${a.customer_name} · şu an ` : ''}${relativeDay(dayOf(a.starts_at))} · ${formatTime(a.starts_at)} – ${formatTime(a.ends_at)}` : undefined}>
      {a && moving && (
        <>
          <ReschedulePicker
            appointment={a}
            onDone={(t) => {
              setMovingId(null);
              onChanged(`${a.customer_name}: ${formatDate(dayOf(t), false)} ${formatTime(t)} saatine alındı`);
            }}
          />
          <Button title="Vazgeç" variant="ghost" onPress={() => setMovingId(null)} />
        </>
      )}
      {a && !moving && (
        <>
          <StatusBadge status={a.status} />
          {a.customer_flagged && (
            <Banner
              tone="danger"
              icon="warning-outline"
              title="Sık iptal eden müşteri"
              text={`Randevu alındığında son 6 ayda ${a.prior_cancels} randevusunu iptal etmiş, ${a.prior_no_shows} randevusuna gelmemişti (tüm SiftahGo işletmelerinde). Randevudan önce aramanızı öneririz.`}
            />
          )}
          <Card style={{ gap: 12, backgroundColor: colors.surface2 }}>
            <Info icon="cut-outline" label="Hizmet" value={a.service_name} />
            {a.staff && <Info icon="person-outline" label="Personel" value={a.staff.name} />}
            <Info icon="pricetag-outline" label="Ücret" value={formatPrice(a.price)} />
            <Info icon="call-outline" label="Telefon" value={a.customer_phone} />
            {a.customer_email && <Info icon="mail-outline" label="E-posta" value={a.customer_email} />}
            {a.note ? <Info icon="chatbubble-outline" label="Not" value={a.note} /> : null}
            {customerNote ? <Info icon="document-text-outline" label="Notunuz" value={customerNote} /> : null}
            {pkg ? (
              <Info
                icon="layers-outline"
                label="Paket"
                value={`${pkg.name} · ${pkg.total - pkg.used}/${pkg.total} seans kaldı${a.package_id === pkg.id ? ' · bu randevu düşüldü' : ''}`}
              />
            ) : null}
          </Card>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Ara" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${a.customer_phone}`)} />
            <Button
              title={active ? 'Hatırlat' : 'WhatsApp'}
              icon="logo-whatsapp"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() =>
                Linking.openURL(
                  whatsappLink(a.customer_phone, active ? reminderText(a, businessName) : `Merhaba ${a.customer_name.split(' ')[0]}, ${businessName} olarak sizi tekrar görmek isteriz!`),
                )
              }
            />
          </View>

          {active && a.service_id && !isPast(a.starts_at) && (
            <Button title="Saati değiştir" icon="time-outline" variant="secondary" onPress={() => setMovingId(a.id)} />
          )}

          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}

          {a.status === 'pending' && (
            <View style={{ gap: 8 }}>
              <Button title="Onayla" icon="checkmark" onPress={() => setStatus('confirmed')} loading={busy === 'confirmed'} />
              <Button title="Reddet" variant="dangerGhost" onPress={confirmCancel} loading={busy === 'cancelled'} />
            </View>
          )}
          {a.status === 'confirmed' && (
            <View style={{ gap: 8 }}>
              <Button title="Tamamlandı" icon="checkmark-done" onPress={() => setStatus('completed')} loading={busy === 'completed'} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Gelmedi" icon="ban-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setStatus('no_show')} loading={busy === 'no_show'} />
                <Button title="İptal et" variant="dangerGhost" style={{ flex: 1 }} onPress={confirmCancel} loading={busy === 'cancelled'} />
              </View>
            </View>
          )}
          {!active && (
            <View style={{ gap: 8 }}>
              <Text variant="label" tone="muted">
                Durumu değiştir
              </Text>
              <View style={styles.wrap}>
                {(Object.keys(STATUS) as AppointmentStatus[])
                  .filter((st) => st !== a.status)
                  .map((st) => (
                    <Chip key={st} label={STATUS[st].label} icon={STATUS[st].icon} onPress={() => setStatus(st)} disabled={!!busy} />
                  ))}
              </View>
            </View>
          )}
          {a.customer_id && (
            <Button title="Müşteriyi engelle" icon="ban-outline" variant="dangerGhost" onPress={confirmBlock} loading={busy === 'block'} />
          )}
        </>
      )}
    </Sheet>
  );
}

/** Takvim satırlarında kısa uyarı: sık iptal eden / gelmeyen müşteri */
export function FlaggedNote({ row }: { row: Pick<AgendaRow, 'customer_flagged' | 'prior_cancels' | 'prior_no_shows'> }) {
  if (!row.customer_flagged) return null;
  return (
    <View style={styles.rowCenter}>
      <Ionicons name="warning" size={13} color={colors.danger} />
      <Text variant="caption" tone="danger" numberOfLines={1} style={{ flex: 1 }}>
        Sık iptal · {row.prior_cancels} iptal, {row.prior_no_shows} gelmedi
      </Text>
    </View>
  );
}

function Info({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Ionicons name={icon} size={17} color={colors.ink3} style={{ marginTop: 2 }} />
      <Text tone="muted" style={{ width: 72 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" style={{ flex: 1 }} selectable>
        {value}
      </Text>
    </View>
  );
}
