import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, Field, Text } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Props = {
  appointment: { id: string; businesses: { name: string } | null } | null;
  onClose: () => void;
  onDone: () => void;
  /** Verilmezse randevu değerlendirmesi (add_review) gönderilir; vitrin kuponu için add_coupon_review çağrısı verilir. */
  submit?: (rating: number, comment: string) => PromiseLike<{ error: { message?: string; code?: string } | null }>;
};

const LABELS = ['', 'Kötü', 'İdare eder', 'İyi', 'Çok iyi', 'Mükemmel'];

/** Tamamlanan randevu (ya da kasada kullanılan vitrin kuponu) için puan + yorum alt penceresi. */
export function ReviewSheet({ appointment, onClose, onDone, submit: send }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setRating(0);
    setComment('');
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
    const { error } = send
      ? await send(rating, comment)
      : await supabase.rpc('add_review', { p_appointment_id: appointment.id, p_rating: rating, p_comment: comment });
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
      {error ? (
        <Text variant="label" tone="danger">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
