import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

// Google'dan dönüş adresi (siftahgo://auth/callback). Supabase > Authentication > URL Configuration'da
// izinli olmalı; Android'de uygulamaya da gelir, app/+native-intent.tsx karşılar.
const REDIRECT_PATH = 'auth/callback';

/** "siftahgo://auth/callback#access_token=...&refresh_token=..." adresinden oturum açar. */
async function sessionFromUrl(url: string) {
  const query = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url.slice(url.indexOf('?') + 1);
  const params: Record<string, string> = {};
  for (const part of query.split('&')) {
    const [k, v = ''] = part.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  if (params.error) throw new Error('Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.');
  if (!params.access_token || !params.refresh_token) throw new Error('Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.');
  const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
  if (error) throw error;
}

/** Supabase'de Google girişi açık mı (Authentication > Providers > Google). Kapalıyken düğme gizlenir. */
export async function googleEnabled() {
  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY! },
    });
    const s = (await res.json()) as { external?: { google?: boolean } };
    return !!s.external?.google;
  } catch {
    return false;
  }
}

/**
 * Google hesabıyla giriş veya kayıt (tarayıcıda Google ekranı açılır).
 * true: oturum açıldı, false: kullanıcı vazgeçti. `business`: hesap işletme hesabı olur.
 */
export async function signInWithGoogle(business = false) {
  const redirectTo = Linking.createURL(REDIRECT_PATH);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await sessionFromUrl(result.url);
  if (business) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) await supabase.from('profiles').update({ role: 'business' }).eq('id', auth.user.id);
  }
  return true;
}
