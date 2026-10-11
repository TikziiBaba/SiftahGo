import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { WEB_URL } from './constants';
import { supabase } from './supabase';

export type ImageKind = 'logo' | 'cover' | 'gallery';

export async function pickImages(kind: ImageKind, limit = 1) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: kind !== 'gallery',
    aspect: kind === 'logo' ? [1, 1] : [16, 9],
    allowsMultipleSelection: kind === 'gallery' && limit > 1,
    selectionLimit: kind === 'gallery' ? limit : 1,
    quality: 1,
  });
  return result.canceled ? [] : result.assets;
}

/** Görseli telefonda küçültüp web sitesinin /api/upload adresiyle R2'ye yükler, adresini döndürür (web: lib/upload.ts). */
export async function uploadImage(uri: string, kind: ImageKind) {
  const maxSide = kind === 'logo' ? 512 : 1600;
  let image = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(image.width, image.height) > maxSide) {
    image = await ImageManipulator.manipulate(image)
      .resize(image.width >= image.height ? { width: maxSide } : { height: maxSide })
      .renderAsync();
  }
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });

  const body = new FormData();
  if (Platform.OS === 'web') body.append('file', await (await fetch(saved.uri)).blob(), 'image.jpg');
  // React Native dosyayı { uri, name, type } nesnesiyle gönderir.
  else body.append('file', { uri: saved.uri, name: 'image.jpg', type: 'image/jpeg' } as unknown as Blob);
  body.append('kind', kind);

  // Uygulamada çerez yok; site oturumu erişim anahtarıyla doğrular.
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${WEB_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? 'Görsel yüklenemedi, lütfen tekrar deneyin.');
  return json.url;
}
