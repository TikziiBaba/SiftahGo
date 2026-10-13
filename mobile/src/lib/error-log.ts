import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Bir oturumda en fazla bu kadar hata gönderilir (döngüdeki hata tabloyu doldurmasın).
const MAX_PER_SESSION = 10;
let sent = 0;

/** Hatayı Supabase'deki error_logs tablosuna yazar (web yönetim > Hatalar). Geliştirmede kaydetmez. */
export function reportError(error: unknown) {
  if (__DEV__ || sent >= MAX_PER_SESSION) return Promise.resolve();
  sent++;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  return supabase
    .rpc('log_error', {
      p_source: 'mobile',
      p_message: `${err.name}: ${err.message}`,
      p_stack: err.stack ?? '',
      p_app_version: `${Constants.expoConfig?.version ?? ''} ${Platform.OS}`.trim(),
      p_user_agent: `${Platform.OS} ${Platform.Version}`,
    })
    .then(
      () => {},
      () => {},
    );
}

/**
 * Yakalanmayan JS hatalarını kaydeder; uygulamanın kendi davranışı (çökme ekranı) aynen sürer.
 * Ölümcül hatada uygulama kapanmadan kayıt gitsin diye en fazla 1,5 sn beklenir.
 */
export function installErrorHandler() {
  if (__DEV__ || typeof ErrorUtils === 'undefined') return;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    const send = reportError(error);
    if (!isFatal) return previous(error, isFatal);
    Promise.race([send, new Promise((r) => setTimeout(r, 1500))]).finally(() => previous(error, isFatal));
  });
}
