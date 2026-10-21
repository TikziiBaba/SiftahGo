import { useEffect, useState, type ComponentProps } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const DURATION = 900;
// Karışık harfler her karede değil bu aralıkla değişir: göz yormasın.
const STEP = 45;

/** i. harf ilerleme bu eşiği geçince yerine oturur: önce kısa bir karışıklık, sonra soldan sağa çözülme. */
function scramble(text: string, progress: number, pick: (i: number) => string) {
  return [...text].map((c, i) => (c === ' ' || progress >= 0.3 + (0.7 * (i + 1)) / text.length ? c : pick(i))).join('');
}

// İlk kare de karışık başlar (gerçek metin bir an görünüp kaybolmasın); çizimde rastgele sayı kullanılmaz.
const firstFrame = (text: string) => scramble(text, 0, (i) => CHARS[(text.charCodeAt(i) * 7 + i * 13) % CHARS.length]);

/** Metni karışık harflerden soldan sağa çözerek gösterir; ekran okuyucu baştan gerçek metni okur. */
export function ScrambleText({ text, ...props }: Omit<ComponentProps<typeof Text>, 'children'> & { text: string }) {
  const still = useReducedMotion();
  const [run, setRun] = useState({ text, frame: still ? null : firstFrame(text) });
  // Metin değişince çözülme baştan başlar.
  if (run.text !== text) setRun({ text, frame: still ? null : firstFrame(text) });

  useEffect(() => {
    if (still) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const progress = (Date.now() - started) / DURATION;
      const done = progress >= 1;
      if (done) clearInterval(timer);
      setRun({ text, frame: done ? null : scramble(text, progress, () => CHARS[Math.floor(Math.random() * CHARS.length)]) });
    }, STEP);
    return () => clearInterval(timer);
  }, [text, still]);

  return (
    <Text accessibilityLabel={text} {...props}>
      {run.frame ?? text}
    </Text>
  );
}
