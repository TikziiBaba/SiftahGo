# Deneyler

| Tur | Tür | Fikir | Puan | Sonuç |
|---|---|---|---|---|
| 0 | - | Başlangıç (web LH 96.2, mobil LH 95.8, kontrast 87.5, mobil kod 68.5, web kod 77.5) | 88.8 | - |
| 1 | puan | Web'e robots.txt (5 sayfada SEO 91 → 100) | 89.8 | tutuldu |
| 2 | puan | Metin hiyerarşisi 3 seviye: okunmayan ink4 kaldırıldı, kullanımları ink3 (kontrast 87.5 → 100) | 92.1 | tutuldu |
| 3 | puan | Mobil form alanlarına erişilebilir ad (görünen etiket), radyo durumu checked | 92.6 | tutuldu |
| 4 | puan | Radyo durumu aria-checked ile (RN Web accessibilityState.checked taşımıyor) | 92.9 | tutuldu |
| 5 | puan | Web Keşfet filtrelerine erişilebilir ad (web Lighthouse 100) | 93.0 | tutuldu |
| 6 | puan | Rolü olmayan 5 Pressable a button rolü (mobil kod 68.5 → 72.8) | 93.7 | tutuldu |
| 7 | puan | Mobil: 27 dağınık renk tema adımlarına (Soft/Tint/Line/Ring, shadows) bağlandı (mobil kod 72.8 → 87.8) | 95.9 | tutuldu |

## Özet (7 tur, hedef 95 aşıldı)

- Başlangıç **88.8** → son **95.9**. Tutulmayan tur yok.
- İşe yarayan 3 değişiklik:
  1. Metin hiyerarşisi 3 seviye; okunmayan ink4 kaldırıldı (+2.3, kontrast 100, iki web sayfası ve mobil Hesap'ta kontrast hatası kapandı)
  2. Mobil renklerin tema adımlarına bağlanması (+2.2)
  3. robots.txt (+1.0, beş sayfada SEO 100)
- Bileşenler: web Lighthouse 100, mobil Lighthouse 100, kontrast 100, mobil kod 87.8, web kod 77.5.
- Kalan ölçülebilir iş: mobilde tema dışı 11 yazı boyutu, web'de 18 keyfi yazı boyutu (`text-[10px]` vb.).
