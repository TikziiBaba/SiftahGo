# SiftahGo

Üç parça, ayrı bağımlılıklarla (React sürümleri farklı olduğu için workspace kullanılmıyor):

- `supabase/schema.sql` — tek kaynak şema. Randevu kuralları (`get_available_slots`, `book_appointment`,
  `cancel_appointment`) ve RLS burada. Değiştirince `npm run test:db` çalıştırın.
- `web/` — Next.js 16. Kurallar için `web/AGENTS.md`.
- `mobile/` — Expo SDK 57. Kurallar için `mobile/AGENTS.md`.

`web/src/lib/types.ts` ile `mobile/src/lib/types.ts`, ve iki uygulamadaki kategori listesi aynı tutulmalı.
