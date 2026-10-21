import { Image } from 'expo-image';
import { create } from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

/**
 * Bağlantının QR kodu (web panelindeki ile aynı renk). Logo verilirse en yüksek hata düzeltmesiyle (H) üretilir,
 * ortadaki kare (kenarın ~%22'si) boş bırakılır ve logo oraya konur. 7. sürümden itibaren (uzun adres) ortada
 * hizalama deseni olduğundan logo konmaz (web: lib/qr.ts ile aynı kural).
 */
export function QrCode({ value, size = 220, logo }: { value: string; size?: number; logo?: string | null }) {
  const { d, n, box } = useMemo(() => {
    let qr = create(value, { errorCorrectionLevel: logo ? 'H' : 'M' });
    const withLogo = !!logo && qr.version < 7;
    if (logo && !withLogo) qr = create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const boxSize = Math.round(count * 0.22) | 1;
    const b = withLogo ? { start: (count - boxSize) / 2, size: boxSize } : null;
    const inBox = (r: number, c: number) => !!b && r >= b.start && r < b.start + b.size && c >= b.start && c < b.start + b.size;
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.modules.get(r, c) && !inBox(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { d: path, n: count, box: b };
  }, [value, logo]);
  const q = 2; // kenar boşluğu (modül)
  const unit = size / (n + q * 2);
  const pad = 0.6 * unit;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} accessibilityLabel="QR kod">
        <Rect x={-q} y={-q} width={n + q * 2} height={n + q * 2} fill={colors.white} />
        <Path d={d} fill={colors.brand900} />
      </Svg>
      {logo && box ? (
        <Image
          source={{ uri: logo }}
          contentFit="cover"
          accessible={false}
          style={{
            position: 'absolute',
            left: (box.start + q) * unit + pad,
            top: (box.start + q) * unit + pad,
            width: box.size * unit - pad * 2,
            height: box.size * unit - pad * 2,
            borderRadius: 1.2 * unit,
          }}
        />
      ) : null}
    </View>
  );
}
