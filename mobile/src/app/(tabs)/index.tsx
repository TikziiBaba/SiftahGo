import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glow, Wordmark } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { OptionSheet } from '@/components/pickers';
import { Avatar, Badge, Button, Card, Chip, Empty, Field, PressableScale, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, categoryLabel, CITIES } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business } from '@/lib/types';

// distance_km: "Yakınımda" aramasında uzaklık
type Item = Pick<Business, 'id' | 'slug' | 'name' | 'category' | 'city' | 'district' | 'logo_url' | 'rating_avg' | 'rating_count'> & {
  distance_km?: number;
};

const CITY_KEY = 'siftahgo.city';
const CITY_OPTIONS = [{ value: '', label: 'Tüm şehirler' }, ...CITIES.map((c) => ({ value: c, label: c }))];

function savedCity() {
  try {
    return localStorage.getItem(CITY_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function DiscoverScreen() {
  const { session, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState(savedCity);
  const [cityOpen, setCityOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  const [favorites, setFavorites] = useState<Item[]>([]);
  // "Bugün müsait" ve "Yakınımda" süzgeçleri; konum yalnızca sıralama için sunucuya gider, saklanmaz.
  const [today, setToday] = useState(false);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [nearBusy, setNearBusy] = useState(false);
  const [nearError, setNearError] = useState('');
  // Oturum kapanınca eski liste gösterilmez.
  const shownFavorites = session ? favorites : [];

  // İşletme sayfasında favori değişmiş olabilir; sekmeye her dönüşte tazelenir.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('favorites')
        .select('businesses(id, slug, name, category, city, district, logo_url, rating_avg, rating_count)')
        .order('created_at', { ascending: false })
        .then(({ data }) => setFavorites(((data ?? []) as unknown as { businesses: Item | null }[]).flatMap((x) => (x.businesses ? [x.businesses] : []))));
    }, [session]),
  );

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      let q = supabase
        .from('businesses')
        .select('id, slug, name, category, city, district, logo_url, rating_avg, rating_count')
        .eq('is_published', true)
        .order('rating_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);
      const term = query.trim().replace(/[%_\\]/g, '');
      if (term) q = q.ilike('name', `%${term}%`);
      if (category) q = q.eq('category', category);
      if (city) q = q.eq('city', city);
      // Yakınımda: uzaklığa göre sıralı, şehir süzgeci uygulanmaz.
      const { data } = near
        ? await supabase.rpc('nearby_businesses', { p_lat: near.lat, p_lng: near.lng, p_category: category || null, p_query: term || null })
        : await q;
      let rows = (data ?? []) as Item[];
      if (today && rows.length) {
        const { data: open } = await supabase.rpc('available_today', { p_ids: rows.map((r) => r.id) });
        const ids = new Set((open ?? []) as string[]);
        rows = rows.filter((r) => ids.has(r.id));
      }
      if (!active) return;
      setItems(rows);
      setRefreshing(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, category, city, reload, near, today]);

  async function toggleNear() {
    if (near) return setNear(null);
    setNearBusy(true);
    setNearError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('izin yok');
      const p =
        (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setNear({ lat: p.coords.latitude, lng: p.coords.longitude });
    } catch {
      setNearError('Konum alınamadı. Konum iznini açıp tekrar deneyin.');
    }
    setNearBusy(false);
  }

  function chooseCity(value: string) {
    setCity(value);
    try {
      localStorage.setItem(CITY_KEY, value);
    } catch {}
  }

  const firstName = profile?.full_name.split(' ')[0];

  return (
    <View style={styles.screen}>
      <Glow />
      <FlatList
        data={items ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface2}
            onRefresh={() => {
              setRefreshing(true);
              setReload((r) => r + 1);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 4 }}>
            <View style={s.top}>
              <Wordmark />
              {session ? (
                <Pressable onPress={() => router.navigate('/hesap')} accessibilityRole="button" accessibilityLabel="Hesabım" hitSlop={8}>
                  <Avatar name={profile?.full_name || session.user.email || '?'} size={38} />
                </Pressable>
              ) : (
                <Button title="Giriş" variant="secondary" size="sm" onPress={() => router.push('/giris')} />
              )}
            </View>

            <View style={{ gap: 6, marginTop: 4 }}>
              <Text variant="display">{firstName ? `Merhaba ${firstName},` : 'Randevun bir dokunuşta.'}</Text>
              <Text tone="muted">{firstName ? 'bugün nereden randevu alıyoruz?' : 'Berberden halı sahaya, yakınındaki esnafı bul.'}</Text>
            </View>

            {shownFavorites.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text variant="overline" tone="muted">
                  Favorilerim
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
                  {shownFavorites.map((b) => (
                    <PressableScale
                      key={b.id}
                      onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: b.slug } })}
                      accessibilityRole="button"
                      accessibilityLabel={b.name}
                      scale={0.92}
                      style={s.favorite}>
                      <Logo business={b} size={52} />
                      <Text variant="caption" tone="secondary" numberOfLines={1}>
                        {b.name}
                      </Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field
                containerStyle={{ flex: 1 }}
                icon="search-outline"
                value={query}
                onChangeText={setQuery}
                placeholder="İşletme ara"
                returnKeyType="search"
                autoCorrect={false}
              />
              <PressableScale
                onPress={() => setCityOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Şehir: ${city || 'Tüm şehirler'}`}
                scale={0.95}
                style={[s.city, city && s.cityOn]}>
                <Ionicons name="location-outline" size={18} color={city ? colors.brand300 : colors.ink2} />
                <Text variant="label" tone={city ? 'brand' : 'secondary'} numberOfLines={1} style={{ maxWidth: 96 }}>
                  {city || 'Şehir'}
                </Text>
              </PressableScale>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Bugün müsait" icon="time-outline" selected={today} onPress={() => setToday(!today)} />
              <Chip
                label={nearBusy ? 'Konum alınıyor…' : 'Yakınımda'}
                icon="navigate-outline"
                selected={!!near}
                disabled={nearBusy}
                onPress={toggleNear}
              />
            </View>
            {nearError ? (
              <Text variant="caption" tone="danger">
                {nearError}
              </Text>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
              <Chip label="Tümü" icon="apps-outline" selected={category === ''} onPress={() => setCategory('')} />
              {CATEGORIES.map((c) => (
                <Chip key={c.id} label={c.label} icon={c.icon} selected={category === c.id} onPress={() => setCategory(category === c.id ? '' : c.id)} />
              ))}
            </ScrollView>

            {items && items.length > 0 && (
              <Text variant="overline" tone="muted" style={{ marginTop: 4 }}>
                {items.length === 60 ? '60+' : items.length} işletme{near ? ' · yakınınızda' : city ? ` · ${city}` : ''}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          items === null ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={84} />
              ))}
            </View>
          ) : (
            <Empty
              icon="search-outline"
              title="İşletme bulunamadı"
              text={city ? `${city} için aramanıza uygun işletme yok. Filtreleri değiştirmeyi deneyin.` : 'Aramanıza uygun işletme yok.'}>
              {!!(city || category || query) && (
                <Button
                  title="Filtreleri temizle"
                  variant="secondary"
                  onPress={() => {
                    setQuery('');
                    setCategory('');
                    chooseCity('');
                  }}
                />
              )}
            </Empty>
          )
        }
        renderItem={({ item, index }) => (
          // Kartlar sırayla belirir; ilk sekizden sonrası beklemez.
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)}>
            <BusinessCard item={item} />
          </Animated.View>
        )}
      />
      <OptionSheet
        visible={cityOpen}
        onClose={() => setCityOpen(false)}
        title="Şehir seçin"
        options={CITY_OPTIONS}
        value={city}
        onSelect={chooseCity}
        searchable
      />
    </View>
  );
}

function BusinessCard({ item }: { item: Item }) {
  const place = [
    item.distance_km != null ? `${item.distance_km.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km` : '',
    item.district,
    item.city,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Card
      onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: item.slug } })}
      accessibilityLabel={item.name}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
      <Logo business={item} size={56} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="heading" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {categoryLabel(item.category)}
          {place ? ` · ${place}` : ''}
        </Text>
        {item.rating_count > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="star" size={13} color={colors.gold} />
            <Text variant="label" tone="gold">
              {Number(item.rating_avg).toFixed(1)}
            </Text>
            <Text variant="caption" tone="muted">
              ({item.rating_count})
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 2 }}>
            <Badge label="Yeni" fg={colors.brand300} bg={colors.brandTint} />
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  favorite: { width: 76, alignItems: 'center', gap: 6 },
  city: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  cityOn: { borderColor: colors.brandRing, backgroundColor: colors.brandTint },
});
