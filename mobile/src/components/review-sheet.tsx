import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Image } from 'expo-image';

import { Sheet } from '@/components/sheet';
import { Button, Field, Text } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { pickImages, uploadImage } from '@/lib/upload';

type Props = {
  appointment: { id: string; businesses: { name: string } | null } | null;
  onClose: () => void;
  onDone: () => void;
  /** Verilmezse randevu değerlendirmesi (add_review) gönderilir; vitrin kuponu için add_coupon_review çağrısı verilir. */
  submit?: (rating: number, comment: string) => PromiseLike<{ error: { message?: string; code?: string } | null }>;
  /** Kupon yorumunda fotoğrafın bağlanacağı kod; verilmezse randevu (appointment.id). */
  claimId?: string;
};

const LABELS = ['', 'Kötü', 'İdare eder', 'İyi', 'Çok iyi', 'Mükemmel'];

/** Tamamlanan randevu (ya da kasada kullanılan vitrin kuponu) için puan + yorum alt penceresi. */
export function ReviewSheet({ appointment, onClose, onDone, submit: send, claimId }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  // İsteğe bağlı sonuç fotoğrafı (yönetici onayından sonra yorumla görünür).
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setRating(0);
    setComment('');
    setPhoto(null);
    setError('');
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    if (!appointment) return;
    if (!rating) return setError('Lütfen puan verin.');
    setBusy(true);
    setError('');
    // Fotoğraf önce yüklenir: yükleme olmazsa yorum gönderilmeden tekrar denenebilir.
    let url: string | null = null;
    try {
      if (photo) url = await uploadImage(photo, 'review');
    } catch (e) {
      setBusy(false);
      return setError(e instanceof Error ? e.message : 'Fotoğraf yüklenemedi.');
    }
    const { error } = send
      ? await send(rating, comment)
      : await supabase.rpc('add_review', { p_appointment_id: appointment.id, p_rating: rating, p_comment: comment });
    if (!error && url) {
      const { error: photoError } = await supabase.rpc('attach_review_photo', {
        p_url: url,
        p_appointment_id: claimId ? null : appointment.id,
        p_claim_id: claimId ?? null,
      });
      if (photoError) console.warn('Yorum fotoğrafı eklenemedi', photoError.message);
    }
    setBusy(false);
    if (error) return setError(errorMessage(error));
    reset();
    onDone();
  }

  return (
    <Sheet
      visible={!!appointment}
      onClose={close}
      title={`${appointment?.businesses?.name ?? 'İşletme'} nasıldı?`}
      subtitle="Yorumunuz adınızın baş harfiyle yayınlanır."
      footer={<Button title="Gönder" onPress={submit} loading={busy} />}>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((i) => (
            <Pressable
              key={i}
              onPress={() => {
                haptic.select();
                setRating(i);
                setError('');
              }}
              hitSlop={6}
              accessibilityRole="radio"
              accessibilityLabel={`${i} yıldız`}
              aria-checked={rating === i}>
              <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={40} color={i <= rating ? colors.gold : colors.ink3} />
            </Pressable>
          ))}
        </View>
        <Text variant="label" tone={rating ? 'gold' : 'muted'}>
          {rating ? LABELS[rating] : 'Puan verin'}
        </Text>
      </View>
      <Field placeholder="Deneyiminizi birkaç cümleyle anlatın (isteğe bağlı)" value={comment} onChangeText={setComment} maxLength={1000} multiline />
      {photo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={{ uri: photo }} style={{ width: 64, height: 64, borderRadius: 10 }} />
          <Button title="Fotoğrafı kaldır" icon="close-outline" variant="ghost" size="sm" onPress={() => setPhoto(null)} />
        </View>
      ) : (
        <Button
          title="Sonuç fotoğrafı ekle (isteğe bağlı)"
          icon="camera-outline"
          variant="secondary"
          size="sm"
          onPress={async () => {
            const [asset] = await pickImages('review');
            if (asset) setPhoto(asset.uri);
          }}
        />
      )}
      <Text variant="caption" tone="muted">
        Fotoğraf incelendikten sonra yorumunuzla birlikte görünür.
      </Text>
      {error ? (
        <Text variant="label" tone="danger">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
