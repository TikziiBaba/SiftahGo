import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Cover } from '@/components/brand';
import { Logo } from '@/components/business-logo';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, SectionTitle, styles, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Business } from '@/lib/types';
import { pickImages, uploadImage, type ImageKind } from '@/lib/upload';

const GALLERY_MAX = 12;

export default function ImagesScreen() {
  const { business } = useAuth();
  return business ? <Images business={business} /> : null;
}

function Images({ business }: { business: Business }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [error, setError] = useState('');

  async function save(patch: Partial<Pick<Business, 'logo_url' | 'cover_url' | 'gallery'>>) {
    const { error } = await supabase.from('businesses').update(patch).eq('id', business.id);
    if (error) throw new Error(errorMessage(error));
    await refresh();
  }

  async function pick(kind: ImageKind) {
    setError('');
    const assets = await pickImages(kind, GALLERY_MAX - business.gallery.length);
    if (!assets.length) return;
    setUploading(kind);
    try {
      if (kind === 'gallery') {
        const urls: string[] = [];
        for (const a of assets.slice(0, GALLERY_MAX - business.gallery.length)) urls.push(await uploadImage(a.uri, 'gallery'));
        await save({ gallery: [...business.gallery, ...urls] });
      } else {
        const url = await uploadImage(assets[0].uri, kind);
        await save(kind === 'logo' ? { logo_url: url } : { cover_url: url });
      }
      toast('Görsel yüklendi.');
    } catch (e) {
      setError((e as Error).message);
    }
    setUploading(null);
  }

  function remove(label: string, patch: Partial<Pick<Business, 'logo_url' | 'cover_url' | 'gallery'>>) {
    Alert.alert(`${label} kaldırılsın mı?`, undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () => save(patch).catch((e: Error) => setError(e.message)),
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text tone="muted">Logo ve kapak, sayfanızda ve aramada görünür. Fotoğraflar telefonda küçültülerek yüklenir.</Text>
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}

      <SectionTitle title="Logo" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Logo business={business} size={72} />
        <View style={{ flex: 1, gap: 8 }}>
          <Button
            title={business.logo_url ? 'Logoyu değiştir' : 'Logo yükle'}
            icon="image-outline"
            variant="secondary"
            size="sm"
            loading={uploading === 'logo'}
            disabled={!!uploading}
            onPress={() => pick('logo')}
          />
          {business.logo_url && <Button title="Kaldır" variant="dangerGhost" size="sm" onPress={() => remove('Logo', { logo_url: null })} />}
        </View>
      </Card>

      <SectionTitle title="Kapak fotoğrafı" />
      <Card style={{ gap: 12, padding: 12 }}>
        <Cover uri={business.cover_url} height={150} style={{ borderRadius: radius.md }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title={business.cover_url ? 'Kapağı değiştir' : 'Kapak yükle'}
            icon="image-outline"
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            loading={uploading === 'cover'}
            disabled={!!uploading}
            onPress={() => pick('cover')}
          />
          {business.cover_url && <Button title="Kaldır" variant="dangerGhost" size="sm" onPress={() => remove('Kapak', { cover_url: null })} />}
        </View>
      </Card>

      <SectionTitle title={`Galeri · ${business.gallery.length}/${GALLERY_MAX}`} />
      <View style={s.grid}>
        {business.gallery.map((url) => (
          <View key={url} style={s.cell}>
            <Image source={url} style={s.photo} contentFit="cover" transition={150} />
            <Pressable
              onPress={() => remove('Fotoğraf', { gallery: business.gallery.filter((u) => u !== url) })}
              accessibilityRole="button"
              accessibilityLabel="Fotoğrafı kaldır"
              hitSlop={6}
              style={s.removeBadge}>
              <Ionicons name="close" size={14} color={colors.white} />
            </Pressable>
          </View>
        ))}
        {business.gallery.length < GALLERY_MAX && (
          <Pressable
            onPress={() => pick('gallery')}
            disabled={!!uploading}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf ekle"
            style={({ pressed }) => [s.cell, s.add, pressed && { opacity: 0.7 }]}>
            {uploading === 'gallery' ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <>
                <Ionicons name="add" size={26} color={colors.brand300} />
                <Text variant="caption" tone="brand">
                  Ekle
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.5%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.surface2 },
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandRing,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
