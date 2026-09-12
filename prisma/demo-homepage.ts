// Original seed composition; used to preserve merchant edits during demo upgrades.
export const legacyHomepageBlocks = [
  {
    type: "Hero",
    title: {
      fa: "سبک خودت را پیدا کن",
      tr: "Tarzını keşfet",
      en: "Find your style",
    },
    body: {
      fa: "انتخاب‌های آرام و ماندگار",
      tr: "Sade ve kalıcı seçimler",
      en: "Quiet, enduring choices",
    },
    ctaLabel: { fa: "مشاهده", tr: "Keşfet", en: "Explore" },
    ctaUrl: "/",
  },
  {
    type: "CategoryCards",
    title: { fa: "دسته‌بندی‌ها", tr: "Kategoriler", en: "Categories" },
    source: { mode: "category", limit: 4 },
  },
  {
    type: "ProductStrip",
    title: { fa: "تازه‌ها", tr: "Yeni gelenler", en: "New arrivals" },
    source: { mode: "latest", limit: 4 },
  },
  {
    type: "TrustBar",
    items: [
      { fa: "خرید امن", tr: "Güvenli alışveriş", en: "Secure shopping" },
      { fa: "پشتیبانی شفاف", tr: "Şeffaf destek", en: "Clear support" },
    ],
  },
];
