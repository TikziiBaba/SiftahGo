import { create } from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

/** Bağlantının QR kodu (web panelindeki ile aynı renk). */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const qr = create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.modules.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { d: path, n: count };
  }, [value]);
  const q = 2; // kenar boşluğu (modül)
  return (
    <Svg width={size} height={size} viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} accessibilityLabel="QR kod">
      <Rect x={-q} y={-q} width={n + q * 2} height={n + q * 2} fill={colors.white} />
      <Path d={d} fill={colors.brand900} />
    </Svg>
  );
}
