// Web sitesiyle aynı koyu tema (web/src/app/globals.css).
export const colors = {
  // Zemin ve yüzeyler (koyudan açığa)
  bg: '#060808',
  surface: '#0d1112',
  surface2: '#141a1b',
  surface3: '#1c2325',

  // Çizgiler
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.13)',
  // Kartın üst kenarındaki ışık
  edge: 'rgba(255,255,255,0.1)',

  // Metin
  ink: '#f1f5f4',
  ink2: '#b3bebb',
  ink3: '#808d8a',

  // Marka: turkuaz
  brand: '#2dd4bf', // brand-400
  brand300: '#5eead4',
  brand200: '#99f6e4',
  brand500: '#14b8a6',
  brand700: '#0f766e',
  brand800: '#115e59',
  brand900: '#134e4a',
  brandInk: '#042f2e', // marka zemin üstündeki yazı
  // Şeffaflık adımları: Soft (seçili kart zemini) < Tint (rozet zemini) < Line (ince kenar) < Ring (odak/seçili kenar)
  brandSoft: 'rgba(45,212,191,0.07)',
  brandTint: 'rgba(45,212,191,0.12)',
  brandLine: 'rgba(45,212,191,0.25)',
  brandRing: 'rgba(45,212,191,0.4)',

  // "Siftah" sıcak vurgu
  gold: '#f5b544',
  goldTint: 'rgba(245,181,68,0.12)',

  danger: '#fb7185',
  dangerSolid: '#f43f5e',
  dangerTint: 'rgba(251,113,133,0.1)',
  dangerLine: 'rgba(251,113,133,0.2)',
  success: '#34d399',
  successTint: 'rgba(52,211,153,0.1)',
  successLine: 'rgba(52,211,153,0.2)',
  warning: '#fcd34d',
  warningSoft: 'rgba(251,191,36,0.05)',
  warningTint: 'rgba(251,191,36,0.1)',
  warningLine: 'rgba(251,191,36,0.22)',
  info: '#7dd3fc',
  infoTint: 'rgba(56,189,248,0.1)',

  overlay: 'rgba(0,0,0,0.65)',
  // Görsel üstündeki yüzen düğme zemini ve zemine doğru solan geçişin başı
  bgGlass: 'rgba(6,8,8,0.6)',
  bgClear: 'rgba(6,8,8,0)',
  white: '#ffffff',
  black: '#000000',
  white04: 'rgba(255,255,255,0.04)',
  white08: 'rgba(255,255,255,0.08)',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

// Geist (sitedeki yazı tipi). Android'de kalınlık fontWeight ile değil aile adıyla seçilir.
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
};

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' as const },
};

export const shadows = {
  // Seçili gün/saat hücresi
  brandSm: '0 8px 20px -8px rgba(45,212,191,0.6)',
  // Ekranın altındaki ana eylem düğmesi
  brandLg: '0 12px 40px -6px rgba(45,212,191,0.6)',
  // Yüzen bildirim kartı
  float: '0 12px 32px -8px rgba(0,0,0,0.6)',
  // Logodaki altın nokta
  goldDot: '0 0 10px rgba(245,181,68,0.9)',
};

// Dükkân sayfası renkleri (Pro paketi); web/src/lib/constants.ts ile aynı tutun.
// light: seçili çip yazısı (200), soft: yazı/ikon (300), base: düğme (400), deep: koyu zemin (900), ink: renkli zemindeki yazı (950)
export const ACCENTS = [
  { id: 'turkuaz', label: 'Turkuaz', light: '#99f6e4', soft: '#5eead4', base: '#2dd4bf', deep: '#134e4a', ink: '#042f2e' },
  { id: 'zumrut', label: 'Zümrüt', light: '#a7f3d0', soft: '#6ee7b7', base: '#34d399', deep: '#064e3b', ink: '#022c22' },
  { id: 'gok', label: 'Gök', light: '#bae6fd', soft: '#7dd3fc', base: '#38bdf8', deep: '#0c4a6e', ink: '#082f49' },
  { id: 'lavanta', label: 'Lavanta', light: '#ddd6fe', soft: '#c4b5fd', base: '#a78bfa', deep: '#4c1d95', ink: '#2e1065' },
  { id: 'pembe', label: 'Pembe', light: '#fbcfe8', soft: '#f9a8d4', base: '#f472b6', deep: '#831843', ink: '#500724' },
  { id: 'kehribar', label: 'Kehribar', light: '#fde68a', soft: '#fcd34d', base: '#fbbf24', deep: '#78350f', ink: '#451a03' },
  { id: 'mercan', label: 'Mercan', light: '#fecdd3', soft: '#fda4af', base: '#fb7185', deep: '#881337', ink: '#4c0519' },
] as const;

export type Accent = (typeof ACCENTS)[number];

export function accentOf(id: string | undefined): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

/** "#2dd4bf", 0.12 -> "rgba(45,212,191,0.12)": sayfa renginin şeffaf tonları için. */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
