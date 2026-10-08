import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';

import { Button, Field, styles } from '@/components/ui';
import { colors } from '@/lib/constants';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Props = {
  appointment: { id: string; businesses: { name: string } | null } | null;
  onClose: () => void;
  onDone: () => void;
};

/** Tamamlanan randevu için puan + yorum alt penceresi. */
export function ReviewSheet({ appointment, onClose, onDone }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setRating(0);
    setComment('');
    setError('');
    onClose();
  }

  async function submit() {
    if (!appointment) return;
    if (!rating) return setError('Lütfen puan verin.');
    setBusy(true);
    const { error } = await supabase.rpc('add_review', { p_appointment_id: appointment.id, p_rating: rating, p_comment: comment });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setRating(0);
    setComment('');
    onDone();
  }

  return (
    <Modal visible={!!appointment} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 14 }}>
          <Text style={styles.h2}>{appointment?.businesses?.name ?? 'İşletme'} nasıldı?</Text>
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((i) => (
              <Pressable key={i} onPress={() => setRating(i)} hitSlop={6} accessibilityLabel={`${i} yıldız`} accessibilityState={{ selected: rating === i }}>
                <Text style={{ fontSize: 36, color: i <= rating ? '#f59e0b' : '#d6d3d1' }}>★</Text>
              </Pressable>
            ))}
          </View>
          <Field label="Yorum (isteğe bağlı)" value={comment} onChangeText={setComment} maxLength={1000} multiline />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Gönder" onPress={submit} loading={busy} />
          <Button title="Vazgeç" variant="ghost" onPress={close} />
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>Yorumunuz adınızın baş harfiyle yayınlanır.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
