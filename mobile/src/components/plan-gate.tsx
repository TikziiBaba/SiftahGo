import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Empty, Skeleton, styles } from '@/components/ui';
import { isShowcase, isSubscribed } from '@/lib/constants';
import { usePlan } from '@/lib/plan';
import type { Business } from '@/lib/types';

/** Özellik paketinizde yoksa yükseltme kartı gösterir, varsa içeriği (web: components/plan-gate.tsx). */
export function PlanGate({
  business,
  feature,
  title,
  header,
  children,
}: {
  business: Business;
  feature: string;
  title: string;
  /** Kilitliyken ve yüklenirken üstte gösterilir (sekme başlığı gibi) */
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const plan = usePlan(business.plan_id);
  if (plan && isSubscribed(business) && plan.features.includes(feature)) return <>{children}</>;
  return (
    <View style={styles.content}>
      {header}
      {plan === undefined ? (
        <>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </>
      ) : (
        <Empty
          icon="lock-closed-outline"
          title={`${title} paketinizde yok`}
          text={
            isShowcase(business)
              ? 'Bu özellik Vitrin paketinizle gelir; paketinizin geçerli olduğundan emin olun.'
              : 'Esnaf veya Pro paketine geçerek bu özelliği hemen kullanmaya başlayabilirsiniz.'
          }>
          <Button title={isShowcase(business) ? 'Aboneliğimi gör' : 'Paketleri gör'} icon="sparkles-outline" onPress={() => router.push('/yonetim/abonelik')} />
        </Empty>
      )}
    </View>
  );
}
