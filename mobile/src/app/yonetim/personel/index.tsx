import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { RevealCell } from '@/components/motion';
import { Avatar, Badge, Banner, Button, Card, Empty, Skeleton, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { usePlan } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Business, Service, Staff, StaffService } from '@/lib/types';

export default function StaffScreen() {
  const { business } = useAuth();
  return business ? <StaffList business={business} /> : null;
}

// customHours: kendi çalışma saatleri olan personelin kimlikleri
type Data = { staff: Staff[]; services: Service[]; links: StaffService[]; customHours: string[] };

function StaffList({ business }: { business: Business }) {
  const plan = usePlan(business.plan_id);
  const [data, setData] = useState<Data | null>(null);
  const add = () => router.push({ pathname: '/yonetim/personel/[id]', params: { id: 'yeni' } });

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [st, sv] = await Promise.all([
          supabase.from('staff').select('*').eq('business_id', business.id).order('sort_order').order('created_at'),
          supabase.from('services').select('*').eq('business_id', business.id).order('sort_order').order('created_at'),
        ]);
        const staff = (st.data ?? []) as Staff[];
        const ids = staff.map((x) => x.id);
        const [{ data: links }, { data: hours }] = staff.length
          ? await Promise.all([
              supabase.from('staff_services').select('*').in('staff_id', ids),
              supabase.from('staff_hours').select('staff_id').in('staff_id', ids),
            ])
          : [{ data: [] }, { data: [] }];
        setData({
          staff,
          services: (sv.data ?? []) as Service[],
          links: (links ?? []) as StaffService[],
          customHours: (hours ?? []).map((h: { staff_id: string }) => h.staff_id),
        });
      })();
    }, [business.id]),
  );

  // Not: data! gibi ifadeler React Compiler'ın null kontrolünü kaldırmasına yol açıyor; yerel değişken kullanın.
  const staffList = data ? data.staff : [];
  const links = data ? data.links : [];
  const services = data ? data.services : [];
  const customHours = data ? data.customHours : [];
  const activeCount = staffList.filter((x) => x.is_active).length;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerRight: () => <HeaderButton icon="add" label="Personel ekle" onPress={add} /> }} />
      <FlatList
        data={staffList}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text tone="muted">Her personelin ayrı takvimi olur; aynı saatte her biri ayrı randevu alabilir.</Text>
            {data && activeCount === 0 && <Banner tone="warning" icon="alert-circle-outline" text="Aktif personel olmadığı için müşteriler randevu alamaz." />}
            {plan?.staff_limit ? (
              <Text variant="caption" tone="muted">
                Aktif personel: {activeCount}/{plan.staff_limit} · {plan.name} paketi
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          data === null ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={72} />
              <Skeleton height={72} />
            </View>
          ) : (
            <Empty icon="people-outline" title="Henüz personel yok">
              <Button title="Personel ekle" icon="add" onPress={add} />
            </Empty>
          )
        }
        ListFooterComponent={staffList.length ? <Button title="Personel ekle" icon="add" variant="secondary" onPress={add} style={{ marginTop: 4 }} /> : null}
        CellRendererComponent={RevealCell}
        renderItem={({ item: x }) => {
          const own = links.filter((l) => l.staff_id === x.id).map((l) => l.service_id);
          const summary = own.length
            ? services
                .filter((sv) => own.includes(sv.id))
                .map((sv) => sv.name)
                .join(', ')
            : 'Tüm hizmetler';
          return (
            <Card
              onPress={() => router.push({ pathname: '/yonetim/personel/[id]', params: { id: x.id } })}
              accessibilityLabel={x.name}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, !x.is_active && { opacity: 0.6 }]}>
              <Avatar name={x.name} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={[styles.rowCenter, { gap: 6 }]}>
                  <Text variant="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
                    {x.name}
                  </Text>
                  {!x.is_active && <Badge label="Pasif" />}
                </View>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {[x.title, summary, customHours.includes(x.id) && 'Kendi saatleri'].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
            </Card>
          );
        }}
      />
    </View>
  );
}
