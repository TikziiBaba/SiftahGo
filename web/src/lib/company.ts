// Satıcı / hizmet sağlayıcı bilgileri: iletişim sayfasında, yasal metinlerde ve site altında görünür.
// PayTR başvurusundaki bilgilerle aynı olmalı.
// Vergi levhası olmadığı için satıcı gerçek kişidir (PayTR "Bireysel Başvuru").
export const COMPANY = {
  name: "Bekir Kaplan",
  address: "Diriliş Mah. 21. Sok., Sivas / Türkiye",
  phone: "0545 645 84 16",
  email: "destek@neardrop.bekirr.dev",
};

/** Yasal metinlerin son güncellenme tarihi. Metin değişince güncelleyin. */
export const LEGAL_UPDATED = "20 Ekim 2026";

export const LEGAL_DOCS = [
  { href: "/yasal/gizlilik", label: "Gizlilik politikası" },
  { href: "/yasal/cerez-politikasi", label: "Çerez politikası" },
  { href: "/yasal/kvkk-basvuru", label: "KVKK başvuru formu" },
  { href: "/yasal/kullanim-kosullari", label: "Hizmet şartları" },
  { href: "/yasal/guvenlik", label: "Güvenlik açıklamaları" },
  { href: "/yasal/mesafeli-satis", label: "Mesafeli satış sözleşmesi" },
  { href: "/yasal/iptal-iade", label: "İptal ve iade" },
  { href: "/iletisim", label: "İletişim ve bize ulaşın" },
] as const;
