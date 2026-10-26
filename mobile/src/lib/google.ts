import { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

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

// Supabase'deki Google sağlayıcısının Web istemcisi; Android'deki yerel girişin kimlik jetonu bunun adına alınır
// (eas.json). Google Cloud'da paket adı ve imza SHA-1'iyle bir Android istemcisi de olmalı, yoksa giriş hata verir.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const native = Platform.OS === 'android' && !!WEB_CLIENT_ID;
if (native) GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

/**
 * Android'de telefondaki Google hesabı uygulamanın içinde seçilir (tarayıcı açılmaz).
 * 'cancelled': kullanıcı vazgeçti; null: yerel giriş kullanılamadı, tarayıcıyla denenmeli.
 */
async function nativeSignIn(): Promise<'ok' | 'cancelled' | null> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (isCancelledResponse(res)) return 'cancelled';
    if (!res.data.idToken) return null;
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: res.data.idToken });
    if (error) throw error;
    return 'ok';
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return 'cancelled';
    // Play Hizmetleri yok, Android istemcisi tanımsız (DEVELOPER_ERROR) vb.: tarayıcı akışı dener.
    console.warn('Yerel Google girişi kullanılamadı', e);
    return null;
  }
}

/** Tarayıcıda Google ekranı açılır; dönüş adresindeki oturumla giriş yapılır. */
async function browserSignIn() {
  const redirectTo = Linking.createURL(REDIRECT_PATH);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await sessionFromUrl(result.url);
  return true;
}

/**
 * Google hesabıyla giriş veya kayıt: Android'de uygulama içinde, olmazsa tarayıcıda.
 * true: oturum açıldı, false: kullanıcı vazgeçti. `business`: hesap işletme hesabı olur.
 */
export async function signInWithGoogle(business = false) {
  const result = native ? await nativeSignIn() : null;
  if (result === 'cancelled') return false;
  if (result === null && !(await browserSignIn())) return false;
  if (business) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) await supabase.from('profiles').update({ role: 'business' }).eq('id', auth.user.id);
  }
  return true;
}

/** Çıkışta Google hesabı da unutulur; sonraki girişte hesap yeniden seçilebilir. */
export async function signOutGoogle() {
  if (native) await GoogleSignin.signOut().catch(() => {});
}
