import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { WEB_URL } from '@/lib/constants';

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
/** Site anahtarı yoksa (veya web'de) bot kontrolü gösterilmez ve formlar token beklemez. */
const enabled = !!SITE_KEY && Platform.OS !== 'web';

// Turnstile, sayfanın adresini Cloudflare'de izin verilen alan adlarıyla karşılaştırır: baseUrl sitenin adresi.
const html = (key: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style>
<script>
  function ok(t) { window.ReactNativeWebView.postMessage(t); }
  function no() { window.ReactNativeWebView.postMessage(''); }
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head><body>
<div class="cf-turnstile" data-sitekey="${key}" data-theme="dark" data-language="tr"
  data-callback="ok" data-expired-callback="no" data-error-callback="no"></div>
</body></html>`;

const CHALLENGE = 'https://challenges.cloudflare.com';
const root = (url: string) => url.replace(/\/$/, '');

/**
 * WebView yalnızca kendi sayfasını (sitenin kökü ya da boş sayfa) ve Cloudflare'in kontrol çerçevesini yükler.
 * Başka adres uygulamanın içinde açılmaz; ana çerçevedeki bir https bağlantısıysa dış tarayıcıda açılır.
 * originWhitelist bilerek açık: dar tutulursa kütüphane uymayan her adresi (iframe ve tel: gibi şemalar dahil)
 * kendiliğinden dışarıda açıyor; süzme burada yapılır.
 */
function allowLoad({ url, isTopFrame }: { url: string; isTopFrame?: boolean }) {
  if (url === 'about:blank' || root(url) === root(WEB_URL) || url === CHALLENGE || url.startsWith(`${CHALLENGE}/`)) return true;
  if (isTopFrame !== false && url.startsWith('https://')) Linking.openURL(url).catch(() => {});
  return false;
}

function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  return (
    <View style={{ height: 70 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html: html(SITE_KEY!), baseUrl: WEB_URL }}
        onShouldStartLoadWithRequest={allowLoad}
        onMessage={(e) => onToken(e.nativeEvent.data || null)}
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
}

/**
 * Cloudflare Turnstile bot kontrolü; token Supabase'e `captchaToken` olarak gider. Token tek kullanımlık:
 * başarısız denemeden sonra `retry` yeni kontrol açar.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  return {
    token: token ?? undefined,
    ready: !enabled || !!token,
    widget: enabled ? <Turnstile key={key} onToken={setToken} /> : null,
    retry: () => {
      setToken(null);
      setKey((k) => k + 1);
    },
  };
}
