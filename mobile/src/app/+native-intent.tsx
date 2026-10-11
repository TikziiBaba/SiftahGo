// Google girişinin dönüş adresi (siftahgo://auth/callback, lib/google.ts) bir ekran değil; oturumu
// giriş ekranı açar. Android bu adresi uygulamaya da iletir; "sayfa bulunamadı" yerine ana sayfaya gidilir.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('auth/callback') ? '/' : path;
}
