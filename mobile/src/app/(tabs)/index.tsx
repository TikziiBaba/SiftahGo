import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Logo } from '@/components/business-logo';
import { Empty, Loading, styles } from '@/components/ui';
import { CATEGORIES, categoryLabel, colors } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { Business } from '@/lib/types';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<Business[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      let q = supabase
        .from('businesses')
        .select('id, slug, name, category, city, district, logo_url, rating_avg, rating_count')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(60);
      const term = query.trim().replace(/[%_\\]/g, '');
      if (term) q = q.ilike('name', `%${term}%`);
      if (category) q = q.eq('category', category);
      const { data } = await q;
      if (!active) return;
      setItems((data ?? []) as Business[]);
      setRefreshing(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, category, reload]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={items ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setReload((r) => r + 1);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="İşletme adı ara"
              placeholderTextColor="#a8a29e"
              style={styles.input}
              returnKeyType="search"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[{ id: '', label: 'Tümü' }, ...CATEGORIES].map((c) => (
                <Pressable key={c.id} onPress={() => setCategory(c.id)} style={[styles.chip, category === c.id && styles.chipActive]}>
                  <Text style={{ color: category === c.id ? '#fff' : colors.text, fontWeight: '500' }}>{c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={items === null ? <Loading /> : <Empty text="Aramanıza uygun işletme bulunamadı." />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: item.slug } })}
            style={({ pressed }) => [styles.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
            <Logo business={item} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{item.name}</Text>
              <Text style={styles.muted}>
                {categoryLabel(item.category)}
                {item.city ? ` · ${[item.district, item.city].filter(Boolean).join(', ')}` : ''}
                {item.rating_count > 0 ? `  ★ ${Number(item.rating_avg).toFixed(1)}` : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
