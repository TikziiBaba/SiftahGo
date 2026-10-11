# Döngü talimatı: tasarım

Hedef: SiftahGo'nun web (`web/src`) ve mobil (`mobile/src`, `mobile/app.json`) arayüzünü geliştirip
`python dongu/tasarim/puan.py` çıktısını yükseltmek. Ayrıntılı eksikler `dongu/tasarim/.cache/rapor.json` içinde.

Kurallar:
- SADECE arayüz kodunu değiştir: `web/src`, `mobile/src`, `mobile/app.json`. `puan.py` ve `program.md`'ye DOKUNMA.
  Veritabanı, API ve iş mantığı bu döngünün konusu değil.
- Her turda TEK bir fikir uygula (birden çok dosyaya yayılabilir ama tek amaç).
- Değişiklikten sonra web ve mobilde tip denetimi + lint geçmeli; geçmezse tur geçersiz.
- Sonra `python dongu/tasarim/puan.py` çalıştır.
- İki tür tur var:
  - **Puan turu:** Puan öncekinden YÜKSEKSE tutulur; AYNI ya da DÜŞÜKSE geri alınır.
  - **Görsel tur** (puanın ölçemediği güzelleştirme: hareket, boşluk, düzen): puan DÜŞMEZSE ve önce/sonra
    ekran görüntüsünde daha iyiyse tutulur. Ekran görüntüleri kullanıcıya gösterilir.
- Geri alma: Repoda commit'lenmemiş başka çalışmalar olduğu için git kullanılmaz. Tur başında değişecek
  dosyalar `.cache/tur-N/` altına kopyalanır; tur tutulmazsa bu kopyalar geri yüklenir. Commit yapılmaz.
- Her turu `deneyler.md` dosyasına tek satır yaz: tur no, tür, denenen fikir, puan, tutuldu/geri alındı.
- Yeni fikir seçerken `deneyler.md`'ye bak; işe yaramayanı tekrar deneme.
- Ölçümü atlatarak puan yükseltme yok: öğeyi Lighthouse'tan gizlemek, sayaçtan kaçmak için rengi
  parçalı yazmak gibi. Değeri tema dosyasına taşımak geçerlidir; amaç tutarlılık.
- 15 tur ya da puan 95 olunca dur ve özet yaz: başlangıç puanı, son puan, işe yarayan 3 değişiklik.

Puanın ölçmediği yerler: giriş gerektiren ekranlar (işletme paneli, randevularım) ve veri gerektiren
ekranlar (işletme sayfası, randevu akışı). Bunlar ortak bileşenler üzerinden dolaylı iyileşir; ayrıca
kullanıcı giriş yaptığında görsel olarak kontrol edilir.
