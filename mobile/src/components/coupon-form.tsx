import { useState } from 'react';
import { View } from 'react-native';

import { CalendarSheet, SelectField, TimeSheet } from '@/components/pickers';
import { Banner, Button, Card, Chip, Field, SectionTitle, Text } from '@/components/ui';
import { addDays, errorMessage, formatDate, todayStr } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Coupon, Service } from '@/lib/types';

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

type Picker = 'starts' | 'ends' | 'startTime' | 'endTime' | null;

/** Kupon açma ve düzenleme formu (web: components/coupon-form.tsx). İlk alımdan sonra tür, değer, gün-saat ve hizmetler kilitlenir. */
export function CouponForm({
  coupon,
  services,
  onSaved,
  onCancel,
}: {
  coupon: Coupon | null;
  services: Service[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const locked = !!coupon && coupon.claimed > 0;
  const [title, setTitle] = useState(coupon?.title ?? '');
  const [type, setType] = useState<'percent' | 'fixed'>(coupon?.discount_type ?? 'percent');
  const [value, setValue] = useState(coupon ? String(Number(coupon.discount_value)) : '');
  const [starts, setStarts] = useState(coupon?.starts_on ?? todayStr());
  const [ends, setEnds] = useState(coupon?.ends_on ?? addDays(todayStr(), 29));
  const [weekdays, setWeekdays] = useState<number[]>(coupon?.weekdays ?? []);
  const [startTime, setStartTime] = useState(coupon?.start_time?.slice(0, 5) ?? '');
  const [endTime, setEndTime] = useState(coupon?.end_time?.slice(0, 5) ?? '');
  const [limit, setLimit] = useState(coupon?.total_limit ? String(coupon.total_limit) : '');
  const [serviceIds, setServiceIds] = useState<string[]>(coupon?.service_ids ?? []);
  const [picker, setPicker] = useState<Picker>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const close = () => setPicker(null);

  async function save() {
    const amount = Number(value.replace(',', '.'));
    if (!title.trim()) return setError('Başlığı yazın.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('İndirim değerini yazın.');
    if (type === 'percent' && (amount < 1 || amount > 90)) return setError('Yüzde 1 ile 90 arasında olmalı.');
    if (limit && (!Number.isInteger(Number(limit)) || Number(limit) < 1)) return setError('Sınır 1 ya da daha büyük bir tam sayı olmalı.');
    if (locked && coupon.total_limit && limit && Number(limit) < coupon.total_limit) return setError('Alınmış bir kuponun sınırı düşürülemez.');
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('save_coupon', {
      p_id: coupon?.id ?? null,
      p_title: title.trim(),
      p_type: type,
      p_value: amount,
      p_starts: starts,
      p_ends: ends,
      p_weekdays: weekdays,
      p_start: startTime || null,
      p_end: endTime || null,
      p_limit: limit ? Number(limit) : null,
      p_services: serviceIds,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <Card style={{ gap: 14 }}>
      <Text variant="heading">{coupon ? 'Kuponu düzenle' : 'Yeni kupon'}</Text>
      {locked && (
        <Banner
          tone="warning"
          icon="lock-closed-outline"
          text={`Bu kupon ${coupon.claimed} kez alındı. İndirim, gün-saat aralığı ve hizmetler artık değişmez; başlık, daha geç bir bitiş tarihi ve daha yüksek bir sınır girebilirsiniz.`}
        />
      )}
      <Field label="Başlık" placeholder="Örn. Hafta içi öğle indirimi" value={title} onChangeText={setTitle} maxLength={80} autoCapitalize="sentences" />

      <Text variant="label" tone="secondary">
        İndirim türü
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Yüzde (%)" solid selected={type === 'percent'} disabled={locked} onPress={() => setType('percent')} />
        <Chip label="Sabit tutar (₺)" solid selected={type === 'fixed'} disabled={locked} onPress={() => setType('fixed')} />
      </View>
      <Field
        label={type === 'percent' ? 'Yüzde (1-90)' : 'Tutar (₺)'}
        value={value}
        onChangeText={(v) => setValue(v.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        editable={!locked}
        style={locked && { opacity: 0.5 }}
      />

      <SelectField label="Başlangıç" icon="calendar-outline" value={formatDate(starts, false)} onPress={() => setPicker('starts')} />
      <SelectField label="Bitiş (en fazla 90 gün)" icon="calendar-outline" value={formatDate(ends, false)} onPress={() => setPicker('ends')} />

      <Text variant="label" tone="secondary">
        Geçerli günler (hiçbiri seçili değilse her gün)
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DAY_NAMES.map((name, i) => (
          <Chip key={name} label={name} selected={weekdays.includes(i + 1)} disabled={locked} onPress={() => setWeekdays(toggle(weekdays, i + 1))} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SelectField style={{ flex: 1 }} label="Başlangıç saati" icon="time-outline" value={startTime || null} placeholder="Yok" onPress={() => !locked && setPicker('startTime')} />
        <SelectField style={{ flex: 1 }} label="Bitiş saati" icon="time-outline" value={endTime || null} placeholder="Yok" onPress={() => !locked && setPicker('endTime')} />
      </View>
      {!locked && (startTime || endTime) ? (
        <Button
          title="Saat sınırını kaldır"
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => {
            setStartTime('');
            setEndTime('');
          }}
        />
      ) : null}

      <Field
        label="Toplam sınır (boşsa sınırsız)"
        value={limit}
        onChangeText={(v) => setLimit(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        editable={!(locked && coupon.total_limit === null)}
        style={locked && coupon.total_limit === null && { opacity: 0.5 }}
        hint={locked && coupon.total_limit ? `En az ${coupon.total_limit}` : undefined}
      />

      <SectionTitle title="Geçerli hizmetler (hiçbiri seçili değilse hepsi)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {services.map((s) => (
          <Chip key={s.id} label={s.name} selected={serviceIds.includes(s.id)} disabled={locked} onPress={() => setServiceIds(toggle(serviceIds, s.id))} />
        ))}
      </View>
      {services.length === 0 && (
        <Text variant="caption" tone="muted">
          Henüz hizmet yok; kupon tüm hizmetlerde geçer.
        </Text>
      )}

      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Button title="Kaydet" onPress={save} loading={busy} />
      <Button title="Vazgeç" variant="ghost" onPress={onCancel} disabled={busy} />

      <CalendarSheet
        key={`s${starts}`}
        visible={picker === 'starts'}
        onClose={close}
        title="Başlangıç günü"
        value={starts}
        max={locked ? coupon.starts_on : undefined}
        onSelect={setStarts}
      />
      <CalendarSheet
        key={`e${ends}`}
        visible={picker === 'ends'}
        onClose={close}
        title="Bitiş günü"
        value={ends}
        min={locked ? coupon.ends_on : starts}
        onSelect={setEnds}
      />
      <TimeSheet visible={picker === 'startTime'} onClose={close} title="Başlangıç saati" value={startTime || null} onSelect={setStartTime} />
      <TimeSheet visible={picker === 'endTime'} onClose={close} title="Bitiş saati" value={endTime || null} onSelect={setEndTime} />
    </Card>
  );
}
