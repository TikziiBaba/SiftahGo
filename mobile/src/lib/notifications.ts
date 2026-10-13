import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { dayOf } from './format';
import { supabase } from './supabase';
import { colors } from './theme';

// Uygulama açıkken gelen bildirim de üstte görünür.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Bu telefonun hesaba bağlı push adresi; çıkışta ayrılır.
let registered: string | null = null;

/**
 * Bildirim izni ister ve telefonun push adresini hesaba bağlar. İzin verilmezse vazgeçer.
 * Sunucu bildirimleri "default" kanalından gönderir; kanal yoksa Android bildirimi göstermez.
 */
export async function registerPushToken() {
  // Emülatörde ve web önizlemesinde push adresi alınamaz.
  if (!Device.isDevice || Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Randevu bildirimleri',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 120, 180],
        lightColor: colors.brand,
      });
    }
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    registered = token;
  } catch (e) {
    // Firebase ayarı (google-services.json) olmayan derlemede adres alınamaz; uygulama çalışmaya devam eder.
    console.warn('Anlık bildirim adresi kaydedilemedi', e);
  }
}

/** Oturumu kapatmadan önce çağrılır: bu telefona artık o hesabın bildirimleri gelmez. */
export async function unregisterPushToken() {
  if (!registered) return;
  await supabase.rpc('unregister_push_token', { p_token: registered });
  registered = null;
}

/** Giriş yapılınca telefonu bildirimlere kaydeder. */
export function usePushRegistration(userId: string | undefined) {
  useEffect(() => {
    if (userId) registerPushToken();
  }, [userId]);
}

type Target = { kind?: string; recipient: string; appointmentId?: string; startsAt?: string; slug?: string; day?: string };

/**
 * Bildirimin ilgili ekranını açar: işletme o günün takvimine (yeni değerlendirmede Yorumlar'a),
 * müşteri randevularına gider. Bekleme listesi haberi işletme sayfasını o gün seçili açar.
 */
export async function openNotificationTarget({ kind, recipient, appointmentId, startsAt, slug, day }: Target) {
  if (kind === 'waitlist' && slug) return router.navigate({ pathname: '/isletme/[slug]', params: { slug, ...(day ? { day } : {}) } });
  if (recipient !== 'business') return router.navigate('/randevular');
  if (kind === 'reviewed') return router.navigate('/yonetim/yorumlar');
  if (!startsAt && appointmentId) {
    const { data } = await supabase.from('appointments').select('starts_at').eq('id', appointmentId).maybeSingle();
    startsAt = data?.starts_at;
  }
  router.navigate(startsAt ? { pathname: '/takvim', params: { day: dayOf(startsAt) } } : '/takvim');
}

function handleTap(response: Notifications.NotificationResponse | null) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  // Aynı dokunuş bir daha işlenmesin.
  Notifications.clearLastNotificationResponse();
  const data = response.notification.request.content.data;
  if (typeof data?.inboxId === 'string') supabase.rpc('mark_inbox_read', { p_id: data.inboxId }).then(() => {});
  if (typeof data?.recipient === 'string') {
    openNotificationTarget({
      kind: typeof data.kind === 'string' ? data.kind : undefined,
      recipient: data.recipient,
      appointmentId: typeof data.appointmentId === 'string' ? data.appointmentId : undefined,
      slug: typeof data.slug === 'string' ? data.slug : undefined,
      day: typeof data.day === 'string' ? data.day : undefined,
    });
  }
}

/** Telefondaki bildirime dokunulunca (uygulama kapalıyken de) ilgili ekranı açar. */
export function useNotificationTaps(enabled: boolean) {
  useEffect(() => {
    // Web önizlemesinde bildirim modülü yok.
    if (!enabled || Platform.OS === 'web') return;
    // Uygulamayı bir bildirim açtıysa
    handleTap(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(handleTap);
    return () => sub.remove();
  }, [enabled]);
}
