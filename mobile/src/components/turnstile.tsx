import { useState } from 'react';
import { Platform, View } from 'react-native';
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

function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  return (
    <View style={{ height: 70 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html: html(SITE_KEY!), baseUrl: WEB_URL }}
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
