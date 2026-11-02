import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { PlanGate } from '@/components/plan-gate';
import { Badge, Banner, Button, Card, Chip, Empty, Field, IconButton, Skeleton, styles, SwitchRow, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { menuLabel } from '@/lib/constants';
import { errorMessage, formatPrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Business, MenuItem } from '@/lib/types';
import { pickImages, uploadImage } from '@/lib/upload';

// Veritabanındaki sınırla aynı (enforce_menu_limit).
const MAX_ITEMS = 200;
const EMPTY = { category: '', name: '', description: '', price: '', image_url: null as string | null, is_active: true };

/** Vitrin esnafının menü ya da ürün listesi (web: panel/menu). */
export default function MenuScreen() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <View style={styles.screen}>
      <PlanGate business={business} feature="menu" title={menuLabel(business.category)}>
        <Menu business={business} />
      </PlanGate>
    </View>
  );
}

function Menu({ business }: { business: Business }) {
  const scrollRef = useRef<ScrollView>(null);
  const label = menuLabel(business.category);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; values: typeof EMPTY } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('menu_items').select('*').eq('business_id', business.id).order('sort_order').order('created_at');
    setItems(((data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) })));
  }, [business.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- menüyü ilk açılışta yükle (web ile aynı)
    load();
  }, [load]);

  // Kategori grupları, ilk görüldükleri sırayla; kategorisiz ürünler en sonda.
  const groups = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const i of items ?? []) map.set(i.category, [...(map.get(i.category) ?? []), i]);
    const named = [...map.entries()].filter(([c]) => c);
    const none = map.get('');
    return none ? [...named, ['', none] as [string, MenuItem[]]] : named;
  }, [items]);
  const categories = useMemo(() => groups.map(([c]) => c).filter(Boolean), [groups]);
  const full = (items?.length ?? 0) >= MAX_ITEMS;

  function open(next: { id: string | null; values: typeof EMPTY }) {
    setEditing(next);
    setError('');
    // Form listenin üstünde açılır.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function change(patch: Partial<typeof EMPTY>) {
    setEditing((cur) => (cur ? { ...cur, values: { ...cur.values, ...patch } } : cur));
  }

  async function save() {
    if (!editing) return;
    const v = editing.values;
    const price = Number(v.price.replace(',', '.'));
    if (!v.name.trim()) return setError('Ürün adını yazın.');
    if (!Number.isFinite(price) || price < 0) return setError('Fiyatı yazın.');
    setBusy(true);
    setError('');
    const values = {
      category: v.category.trim(),
      name: v.name.trim(),
      description: v.description.trim(),
      price,
      image_url: v.image_url,
      is_active: v.is_active,
    };
    const { error } = editing.id
      ? await supabase.from('menu_items').update(values).eq('id', editing.id)
      : await supabase
          .from('menu_items')
          .insert({ ...values, business_id: business.id, sort_order: Math.max(-1, ...(items ?? []).map((i) => i.sort_order)) + 1 });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEditing(null);
    load();
  }

  async function pickPhoto() {
    const assets = await pickImages('menu');
    if (!assets.length) return;
    setUploading(true);
    setError('');
    try {
      change({ image_url: await uploadImage(assets[0].uri, 'menu') });
    } catch (e) {
      setError((e as Error).message);
    }
    setUploading(false);
  }

  async function toggle(i: MenuItem) {
    setError('');
    const { error } = await supabase.from('menu_items').update({ is_active: !i.is_active }).eq('id', i.id);
    if (error) return setError(errorMessage(error));
    load();
  }

  function remove(i: MenuItem) {
    Alert.alert(`"${i.name}" silinsin mi?`, undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setError('');
          const { error } = await supabase.from('menu_items').delete().eq('id', i.id);
          if (error) return setError(errorMessage(error));
          load();
        },
      },
    ]);
  }

  // Aynı kategorideki komşuyla yer değiştirir; sıra numaraları 0..n-1 olarak yeniden yazılır (eşit numaralar olsa da çalışır).
  async function move(i: MenuItem, dir: -1 | 1) {
    if (!items) return;
    const group = items.filter((x) => x.category === i.category);
    const other = group[group.findIndex((x) => x.id === i.id) + dir];
    if (!other) return;
    const order = items.map((x) => x.id);
    const a = order.indexOf(i.id);
    const b = order.indexOf(other.id);
    [order[a], order[b]] = [order[b], order[a]];
    setError('');
    const results = await Promise.all(
      order.map((id, n) => (items.find((x) => x.id === id)!.sort_order === n ? null : supabase.from('menu_items').update({ sort_order: n }).eq('id', id))),
    );
    const failed = results.find((r) => r?.error);
    if (failed?.error) setError(errorMessage(failed.error));
    load();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text tone="muted">
          {label === 'Menü' ? 'Yemek ve içeceklerinizi' : 'Ürünlerinizi'} fiyatıyla sayfanızda gösterin.{items ? ` ${items.length}/${MAX_ITEMS}` : ''}
        </Text>
        <Button title="Ekle" icon="add" disabled={full} onPress={() => open({ id: null, values: EMPTY })} />

        {full ? <Banner tone="warning" icon="alert-circle-outline" text={`En fazla ${MAX_ITEMS} ürün ekleyebilirsiniz.`} /> : null}
        {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

        {editing && (
          <Card style={{ gap: 14 }}>
            <Field
              label="Ürün adı"
              placeholder={label === 'Menü' ? 'Örn. Mercimek çorbası' : 'Örn. Zeytinyağı 1 lt'}
              value={editing.values.name}
              onChangeText={(name) => change({ name })}
              maxLength={100}
            />
            <Field
              label="Fiyat (₺)"
              value={editing.values.price}
              onChangeText={(v) => change({ price: v.replace(/[^\d.,]/g, '') })}
              keyboardType="decimal-pad"
            />
            <Field label="Kategori (isteğe bağlı)" placeholder="Örn. Çorbalar" value={editing.values.category} onChangeText={(category) => change({ category })} maxLength={60} />
            {categories.length > 0 && (
              <View style={styles.wrap}>
                {categories.map((c) => (
                  <Chip key={c} label={c} selected={editing.values.category === c} onPress={() => change({ category: editing.values.category === c ? '' : c })} />
                ))}
              </View>
            )}
            <Field label="Açıklama (isteğe bağlı)" value={editing.values.description} onChangeText={(description) => change({ description })} maxLength={300} />
            <View style={[styles.rowCenter, { gap: 12 }]}>
              {editing.values.image_url ? <Image source={editing.values.image_url} style={{ width: 64, height: 64, borderRadius: radius.md }} contentFit="cover" /> : null}
              <View style={{ flex: 1, gap: 8 }}>
                <Button
                  title={editing.values.image_url ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle (isteğe bağlı)'}
                  icon="image-outline"
                  variant="secondary"
                  size="sm"
                  loading={uploading}
                  onPress={pickPhoto}
                />
                {editing.values.image_url ? <Button title="Kaldır" icon="close" variant="ghost" size="sm" onPress={() => change({ image_url: null })} /> : null}
              </View>
            </View>
            <SwitchRow title="Sayfamda göster" value={editing.values.is_active} onValueChange={(is_active) => change({ is_active })} />
            <Button title="Kaydet" onPress={save} loading={busy} disabled={uploading} />
            <Button title="Vazgeç" variant="ghost" onPress={() => setEditing(null)} disabled={busy} />
          </Card>
        )}

        {items === null && <Skeleton height={80} />}
        {items?.length === 0 && !editing && <Empty icon="restaurant-outline" title="Henüz ürün yok" text="İlk ürününüzü ekleyin." />}
        {groups.map(([category, list]) => (
          <View key={category || 'diger'} style={{ gap: 8 }}>
            {(category || groups.length > 1) && (
              <Text variant="overline" tone="muted">
                {category || 'Kategorisiz'}
              </Text>
            )}
            {list.map((i, n) => (
              <Card key={i.id} style={[{ gap: 8, padding: 12 }, !i.is_active && { opacity: 0.6 }]}>
                <View style={[styles.rowCenter, { gap: 10 }]}>
                  {i.image_url ? (
                    <Image source={i.image_url} style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surface2 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="heading" tone="muted">
                        {i.name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {i.name}
                    </Text>
                    {!i.is_active && <Badge label="Gizli" />}
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {formatPrice(i.price)}
                      {i.description ? ` · ${i.description}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <IconButton icon="arrow-up" label="Yukarı taşı" size={34} style={n === 0 && { opacity: 0.3 }} onPress={() => n > 0 && move(i, -1)} />
                  <IconButton icon="arrow-down" label="Aşağı taşı" size={34} style={n === list.length - 1 && { opacity: 0.3 }} onPress={() => n < list.length - 1 && move(i, 1)} />
                  <IconButton icon={i.is_active ? 'eye-outline' : 'eye-off-outline'} label={i.is_active ? 'Gizle' : 'Göster'} size={34} onPress={() => toggle(i)} />
                  <IconButton
                    icon="create-outline"
                    label="Düzenle"
                    size={34}
                    onPress={() =>
                      open({
                        id: i.id,
                        values: { category: i.category, name: i.name, description: i.description, price: String(i.price), image_url: i.image_url, is_active: i.is_active },
                      })
                    }
                  />
                  <IconButton icon="trash-outline" label="Sil" size={34} color={colors.danger} onPress={() => remove(i)} />
                </View>
              </Card>
            ))}
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
