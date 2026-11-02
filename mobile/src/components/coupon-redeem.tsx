import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, Field, Text } from '@/components/ui';
import { formatDiscount } from '@/lib/coupons';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

type Found = {
  claim_id: string;
  title: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  customer_name: string;
  state: 'active' | 'attached' | 'used' | 'expired' | 'unavailable';
  problem: string | null;
  redeemed_at: string | null;
};

const UNDO_MS = 10 * 60 * 1000;

/** Kasada müşterinin gösterdiği kodu sorgular, onaylanınca kullanılmış sayar; 10 dakika geri alınabilir (web: components/coupon-redeem.tsx). */
export function CouponRedeem({ businessId }: { businessId: string }) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Kasada işaretlenmiş ve 10 dakikası dolmamış kod geri alınabilir. Sunucudaki redeemed_at'tan hesaplanır: sonraki
  // sorgu ve yenileme de geri almayı gösterir; süre dolunca düğme kapanır.
  const [undoable, setUndoable] = useState(false);

  const redeemedAt = found?.redeemed_at;
  useEffect(() => {
    if (!undoable || !redeemedAt) return;
    const t = setTimeout(() => setUndoable(false), Math.max(0, new Date(redeemedAt).getTime() + UNDO_MS - Date.now()));
    return () => clearTimeout(t);
  }, [undoable, redeemedAt]);

  async function lookup() {
    const { data, error } = await supabase.rpc('find_coupon_code', { p_business_id: businessId, p_code: code.trim() });
    if (error) {
      setMessage({ ok: false, text: errorMessage(error) });
      return false;
    }
    // Yanlış kodda hata değil null döner.
    if (!data) {
      setMessage({ ok: false, text: 'Kod bulunamadı' });
      return false;
    }
    const f = data as Found;
    setFound(f);
    setUndoable(f.state === 'used' && !!f.redeemed_at && Date.now() - new Date(f.redeemed_at).getTime() < UNDO_MS);
    return true;
  }

  async function find() {
    setBusy(true);
    setMessage(null);
    setFound(null);
    setUndoable(false);
    await lookup();
    setBusy(false);
  }

  async function redeem() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('redeem_coupon_code', { p_business_id: businessId, p_code: code.trim() });
    if (error) {
      setBusy(false);
      return setMessage({ ok: false, text: errorMessage(error) });
    }
    if (!data) {
      setBusy(false);
      setFound(null);
      return setMessage({ ok: false, text: 'Kod bulunamadı' });
    }
    // Kart yeniden okunur: kullanıldı görünür ve 10 dakika "Geri al" açık kalır.
    const ok = await lookup();
    setBusy(false);
    if (ok) setMessage({ ok: true, text: 'Kupon kullanıldı olarak işaretlendi.' });
  }

  async function undo() {
    if (!found) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('undo_coupon_redeem', { p_claim_id: found.claim_id });
    if (error) {
      setBusy(false);
      return setMessage({ ok: false, text: errorMessage(error) });
    }
    const ok = await lookup();
    setBusy(false);
    if (ok) setMessage({ ok: true, text: 'Geri alındı; kupon yeniden kullanılabilir.' });
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text variant="heading">Kod gir</Text>
        <Text variant="caption" tone="muted">
          Müşterinin gösterdiği 6 haneli kodu girin; indirimi uygulayınca &quot;Kullanıldı&quot; deyin.
        </Text>
      </View>
      <Field
        placeholder="000000"
        value={code}
        onChangeText={(v) => {
          setCode(v.replace(/\D/g, ''));
          setFound(null);
          setMessage(null);
          setUndoable(false);
        }}
        keyboardType="number-pad"
        maxLength={6}
        style={{ letterSpacing: 6 }}
      />
      <Button title="Sorgula" variant="secondary" onPress={find} loading={busy && !found} disabled={busy || code.length !== 6} />

      {message ? <Banner tone={message.ok ? 'success' : 'danger'} icon={message.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} text={message.text} /> : null}

      {found && (
        <View style={{ gap: 4, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
          <Text variant="bodyStrong">{found.title}</Text>
          <Text variant="label" tone="muted">
            {formatDiscount(found)} · {found.customer_name}
          </Text>
          {found.problem ? (
            <View style={{ marginTop: 8 }}>
              <Banner tone="warning" icon="alert-circle-outline" text={found.problem} />
            </View>
          ) : null}
          {undoable ? (
            <Button title="Geri al (10 dakika içinde)" variant="ghost" onPress={undo} disabled={busy} style={{ marginTop: 8 }} />
          ) : !found.problem ? (
            <Button title="Kullanıldı" onPress={redeem} loading={busy} disabled={busy} style={{ marginTop: 8 }} />
          ) : null}
        </View>
      )}
    </Card>
  );
}
