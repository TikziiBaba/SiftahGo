import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Glow } from '@/components/brand';
import { RevealCell } from '@/components/motion';
import { PlanGate } from '@/components/plan-gate';
import { Sheet } from '@/components/sheet';
import { Avatar, Banner, Button, Card, Chip, Empty, Field, IconButton, ScreenHeader, Skeleton, Stat, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage, formatDate, formatPrice, formatTime, phoneKey, whatsappLink } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service, SessionPackage } from '@/lib/types';

type Customer = {
  phone: string;
  name: string;
  total: number;
  completed: number;
  no_show: number;
  cancelled: number;
  spent: number;
  last_visit: string | null;
  next_appointment: string | null;
};

export default function CustomersTab() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <View style={styles.screen}>
      <Glow />
      <PlanGate business={business} feature="customers" title="Müşteri defteri" header={<ScreenHeader title="Müşteriler" />}>
        <Customers business={business} />
      </PlanGate>
    </View>
  );
}

function Customers({ business }: { business: Business }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  // Telefonun son 10 hanesi -> not (yalnızca işletme görür)
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  // Açık paket ekleme formu (seans sayısı metin olarak)
  const [pkgForm, setPkgForm] = useState<{ service_id: string; total: string } | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgError, setPkgError] = useState('');

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        supabase.rpc('get_customers', { p_business_id: business.id }),
        supabase.from('customer_notes').select('phone_key, note').eq('business_id', business.id),
        supabase.from('session_packages').select('*').eq('business_id', business.id).order('created_at'),
        supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order'),
      ]).then(([{ data, error }, { data: noteRows }, { data: packageRows }, { data: serviceRows }]) => {
        setError(error ? errorMessage(error) : '');
        setCustomers((data ?? []) as Customer[]);
        setNotes(Object.fromEntries((noteRows ?? []).map((n) => [n.phone_key, n.note])));
        setPackages((packageRows ?? []) as SessionPackage[]);
        setServices((serviceRows ?? []) as Service[]);
      });
    }, [business.id]),
  );

  function open(c: Customer) {
    setDraft(notes[phoneKey(c.phone)] ?? '');
    setNoteError('');
    setPkgForm(null);
    setPkgError('');
    setSelected(c);
  }

  async function addPackage() {
    const service = services.find((x) => x.id === pkgForm?.service_id);
    const total = Number(pkgForm?.total);
    if (!selected || !service || !Number.isInteger(total) || total < 1 || total > 500) {
      return setPkgError('Hizmet seçin ve 1 ile 500 arasında seans sayısı yazın.');
    }
    setPkgBusy(true);
    setPkgError('');
    const { data, error } = await supabase
      .from('session_packages')
      .insert({
        business_id: business.id,
        phone_key: phoneKey(selected.phone),
        customer_name: selected.name,
        service_id: service.id,
        name: `${service.name} paketi`,
        total,
      })
      .select('*')
      .single();
    setPkgBusy(false);
    if (error) return setPkgError(errorMessage(error));
    setPackages((all) => [...all, data as SessionPackage]);
    setPkgForm(null);
  }

  async function setUsed(p: SessionPackage, used: number) {
    if (used < 0 || used > p.total) return;
    setPkgError('');
    setPackages((all) => all.map((x) => (x.id === p.id ? { ...x, used } : x)));
    const { error } = await supabase.from('session_packages').update({ used }).eq('id', p.id);
    if (error) {
      setPkgError(errorMessage(error));
      setPackages((all) => all.map((x) => (x.id === p.id ? p : x)));
    }
  }

  function removePackage(p: SessionPackage) {
    Alert.alert(`"${p.name}" silinsin mi?`, 'Kalan seans bilgisi silinir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('session_packages').delete().eq('id', p.id);
          if (error) return setPkgError(errorMessage(error));
          setPackages((all) => all.filter((x) => x.id !== p.id));
        },
      },
    ]);
  }

  async function saveNote() {
    const key = selected ? phoneKey(selected.phone) : '';
    if (!key) return;
    setSavingNote(true);
    setNoteError('');
    const text = draft.trim();
    const { error } = text
      ? await supabase
          .from('customer_notes')
          .upsert({ business_id: business.id, phone_key: key, note: text, updated_at: new Date().toISOString() })
      : await supabase.from('customer_notes').delete().eq('business_id', business.id).eq('phone_key', key);
    setSavingNote(false);
    if (error) return setNoteError(errorMessage(error));
    setNotes((all) => {
      const next = { ...all };
      if (text) next[key] = text;
      else delete next[key];
      return next;
    });
    setSelected(null);
  }

  const q = query.trim().toLocaleLowerCase('tr-TR');
  const digits = query.replace(/\D/g, '');
  const list = (customers ?? []).filter(
    (c) => !q || c.name.toLocaleLowerCase('tr-TR').includes(q) || (digits && c.phone.replace(/\D/g, '').includes(digits)),
  );
  const greeting = (c: Customer) => `Merhaba ${c.name.split(' ')[0]}, ${business.name} olarak sizi tekrar görmek isteriz!`;

  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(c) => c.phone}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <ScreenHeader title="Müşteriler" subtitle={customers ? `${customers.length} kişi · telefon numarasına göre` : undefined} />
            <Field icon="search-outline" placeholder="İsim veya telefon ara" value={query} onChangeText={setQuery} autoCorrect={false} />
            {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          customers === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={76} />
              <Skeleton height={76} />
              <Skeleton height={76} />
            </View>
          ) : (
            <Empty
              icon="people-outline"
              title={customers.length === 0 ? 'Henüz müşteriniz yok' : 'Sonuç yok'}
              text={customers.length === 0 ? 'İlk randevular geldikçe müşterileriniz burada listelenir.' : 'Aramanıza uygun müşteri bulunamadı.'}
            />
          )
        }
        CellRendererComponent={RevealCell}
        renderItem={({ item: c }) => (
          // Arama/WhatsApp düğmeleri ekran okuyucuda ayrı erişilsin diye kart değil satır dokunulabilir.
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
            <Pressable
              onPress={() => open(c)}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ayrıntılar`}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={c.name} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {c.completed} ziyaret · {formatPrice(c.spent)}
                  {c.no_show > 0 ? <Text variant="caption" tone="danger">{` · ${c.no_show} kez gelmedi`}</Text> : null}
                </Text>
                <Text variant="caption" tone={c.next_appointment ? 'brand' : 'muted'} numberOfLines={1}>
                  {c.next_appointment
                    ? `Sıradaki: ${formatDate(c.next_appointment, false)} ${formatTime(c.next_appointment)}`
                    : c.last_visit
                      ? `Son ziyaret: ${formatDate(c.last_visit, false)}`
                      : 'Henüz tamamlanan ziyaret yok'}
                </Text>
                {notes[phoneKey(c.phone)] ? (
                  <Text variant="caption" tone="gold" numberOfLines={1}>
                    {notes[phoneKey(c.phone)]}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <IconButton icon="call-outline" label={`${c.name} ara`} size={38} onPress={() => Linking.openURL(`tel:${c.phone}`)} />
            <IconButton icon="logo-whatsapp" label={`${c.name} WhatsApp`} size={38} color={colors.success} onPress={() => Linking.openURL(whatsappLink(c.phone, greeting(c)))} />
          </Card>
        )}
      />

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name} subtitle={selected?.phone}>
        {selected && (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label="Ziyaret" value={String(selected.completed)} icon="checkmark-done" />
              <Stat label="Harcama" value={formatPrice(selected.spent)} icon="cash-outline" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label="Gelmedi" value={String(selected.no_show)} icon="ban-outline" />
              <Stat label="İptal" value={String(selected.cancelled)} icon="close-circle-outline" />
            </View>
            {phoneKey(selected.phone) ? (
              <View style={{ gap: 8 }}>
                <Field
                  label="Notunuz"
                  hint="Yalnızca siz görürsünüz; müşterinin randevusunda da gösterilir."
                  placeholder="Örn. Kısa kesim sever, 3 numara"
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={1000}
                  multiline
                  error={noteError || undefined}
                />
                {draft.trim() !== (notes[phoneKey(selected.phone)] ?? '') && (
                  <Button title="Notu kaydet" icon="save-outline" variant="secondary" onPress={saveNote} loading={savingNote} />
                )}
              </View>
            ) : null}
            {phoneKey(selected.phone) ? (
              <View style={{ gap: 8 }}>
                <Text variant="label" tone="secondary">
                  Seans paketleri
                </Text>
                {packages
                  .filter((p) => p.phone_key === phoneKey(selected.phone))
                  .map((p) => {
                    const left = p.total - p.used;
                    return (
                      <View key={p.id} style={s.pkg}>
                        <Ionicons name="layers-outline" size={18} color={colors.brand300} />
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text variant="caption" tone={left > 0 ? 'muted' : 'warning'}>
                            {left > 0 ? `${left}/${p.total} seans kaldı` : 'Bitti'}
                          </Text>
                        </View>
                        <IconButton icon="remove" label="Bir seans düş" size={34} onPress={() => setUsed(p, p.used + 1)} />
                        <IconButton icon="add" label="Bir seans iade et" size={34} onPress={() => setUsed(p, p.used - 1)} />
                        <IconButton icon="trash-outline" label="Paketi sil" size={34} color={colors.danger} onPress={() => removePackage(p)} />
                      </View>
                    );
                  })}
                {pkgForm ? (
                  <View style={{ gap: 8 }}>
                    <View style={styles.wrap}>
                      {services.map((x) => (
                        <Chip key={x.id} label={x.name} selected={pkgForm.service_id === x.id} onPress={() => setPkgForm({ ...pkgForm, service_id: x.id })} />
                      ))}
                    </View>
                    <Field
                      label="Seans sayısı"
                      keyboardType="number-pad"
                      maxLength={3}
                      value={pkgForm.total}
                      onChangeText={(total) => setPkgForm({ ...pkgForm, total: total.replace(/[^0-9]/g, '') })}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Paketi ekle" style={{ flex: 1 }} onPress={addPackage} loading={pkgBusy} />
                      <Button title="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setPkgForm(null)} />
                    </View>
                  </View>
                ) : services.length > 0 ? (
                  <Button title="Seans paketi ekle" icon="add" variant="secondary" size="sm" onPress={() => setPkgForm({ service_id: services[0].id, total: '10' })} />
                ) : null}
                {pkgError ? (
                  <Text variant="caption" tone="danger">
                    {pkgError}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {selected.next_appointment ? (
              <View style={s.line}>
                <Ionicons name="calendar-outline" size={18} color={colors.brand300} />
                <Text tone="secondary">
                  Sıradaki randevu: {formatDate(selected.next_appointment)} {formatTime(selected.next_appointment)}
                </Text>
              </View>
            ) : null}
            <Button
              title="Randevu ekle"
              icon="add"
              onPress={() => {
                const c = selected;
                setSelected(null);
                router.push({ pathname: '/randevu-ekle', params: { name: c.name, phone: c.phone } });
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Ara" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${selected.phone}`)} />
              <Button
                title="WhatsApp"
                icon="logo-whatsapp"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => Linking.openURL(whatsappLink(selected.phone, greeting(selected)))}
              />
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pkg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingVertical: 6, paddingRight: 4, borderRadius: 14, backgroundColor: colors.surface2 },
});
