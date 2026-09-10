import { PrismaClient, FxMode } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const db = new PrismaClient();

// Deliberately NOT importing from `src/modules/*` (storage provider, job
// queue): this script also runs inside the `ops` image, which — by design
// (D22/D23, minimal attack surface, no Docker socket) — only ships
// package.json/prisma/scripts, never the app's `src/` tree. A minimal local
// write + a raw Job row (matching src/modules/media/queue.ts's enqueue())
// keeps seed.ts runnable from both `app` and `ops` without adding `src` to
// the ops image just for demo data.
async function putLocalMediaFile(key: string, data: Buffer): Promise<string> {
  const root = process.env.MEDIA_DIR ?? "/data/media";
  const p = path.join(root, key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
  return `/media/${key}`;
}
async function putMediaFile(key: string, data: Buffer): Promise<string> {
  if (process.env.STORAGE_PROVIDER !== "s3")
    return putLocalMediaFile(key, data);
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET ?? "media",
      Key: key,
      Body: data,
      ContentType: "image/jpeg",
    }),
  );
  return `/media/${key}`;
}
const roles = [
  "owner",
  "admin",
  "warehouse",
  "accountant",
  "support",
  "data_entry",
  "marketing",
];

// Least-privilege permission sets per role (fix-order A2 + C2). `owner` holds
// "*"; every other role gets only what it needs. `security.role.manage` and
// `users.manage` are deliberately owner/admin-only. Later phases extend these
// sets; negative tests in tests/integration/role-least-privilege.spec.ts pin
// what each role must NOT have.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    "settings.brand.edit",
    "settings.theme.edit",
    "settings.contact.edit",
    "settings.social.edit",
    "settings.legal.edit",
    "settings.maintenance.edit",
    "markets.edit",
    "users.view",
    "users.manage",
    "media.upload",
    "media.write",
    "media.delete",
    "content.menu.read",
    "content.menu.write",
    "content.page.read",
    "content.page.write",
    "content.page.publish",
    "content.page.delete",
    "content.homepage.read",
    "content.homepage.write",
    "content.translation.read",
    "content.translation.write",
    "settings.notification.read",
    "settings.notification.write",
    "settings.notification.test",
    "system.health.view",
    "catalog.product.view",
    "catalog.product.create",
    "catalog.product.edit",
    "catalog.product.publish",
    "pricing.sale_price.edit",
    "pricing.fx.manage",
    "fees.manage",
    "pricing.cost.view",
    "inventory.view",
    "inventory.receive",
    "inventory.stock.adjust",
    "order.view",
    "order.cancel",
    "order.edit",
    "payment.mark_paid",
    "payment.receipt.approve",
    "finance.report.view",
    "crm.customer.export",
    "marketing.campaign.publish",
  ],
  data_entry: [
    "catalog.product.view",
    "catalog.product.create",
    "catalog.product.edit",
    "media.upload",
    "media.write",
    "content.page.read",
    "content.page.write",
    "content.homepage.read",
  ],
  warehouse: [
    "catalog.product.view",
    "inventory.view",
    "inventory.receive",
    "inventory.stock.adjust",
    "order.view",
  ],
  accountant: [
    "order.view",
    "pricing.cost.view",
    "payment.receipt.approve",
    "payment.refund",
    "finance.report.view",
    "finance.expense.create",
  ],
  support: ["order.view", "order.cancel", "users.view", "crm.customer.export"],
  marketing: [
    "catalog.product.view",
    "media.upload",
    "media.write",
    "marketing.campaign.publish",
    "crm.customer.export",
    "content.menu.read",
    "content.menu.write",
    "content.page.read",
    "content.page.write",
    "content.page.publish",
    "content.homepage.read",
    "content.homepage.write",
  ],
};
async function main() {
  for (const key of roles)
    await db.role.upsert({
      where: { key },
      update: {},
      create: { key, nameI18n: { fa: key, en: key } },
    });
  const email = process.env.ADMIN_EMAIL ?? "owner@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Owner",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  const owner = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: owner.id } },
    update: {},
    create: { userId: user.id, roleId: owner.id },
  });
  await db.rolePermission.upsert({
    where: { roleId_permission: { roleId: owner.id, permission: "*" } },
    update: {},
    create: { roleId: owner.id, permission: "*" },
  });
  for (const [key, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.findUniqueOrThrow({ where: { key } });
    for (const permission of permissions)
      await db.rolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission } },
        update: {},
        create: { roleId: role.id, permission },
      });
  }
  await db.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      brand: {
        name: { fa: "استایل هاب", tr: "STYLE HUB", en: "STYLE HUB" },
        tagline: {
          fa: "مد، آرام و ماندگار",
          tr: "Sakin ve kalıcı moda",
          en: "Quiet, enduring fashion",
        },
      },
      finance: {
        pricingBaseCurrency: "USD",
        functionalCurrency: "TRY",
        reportingCurrency: "USD",
      },
      inventory: { lowStockThreshold: 2 },
      contact: {
        email: "hello@example.com",
        phones: {
          IR: "+98 21 0000 0000",
          TR: "+90 212 000 00 00",
          CA: "+1 416 000 0000",
        },
        address: {
          fa: "تهران، ایران",
          tr: "İstanbul, Türkiye",
          en: "Toronto, Canada",
        },
        hours: {
          fa: "شنبه تا پنجشنبه، ۹ تا ۱۸",
          tr: "Pazartesi - Cuma, 09:00 - 18:00",
          en: "Mon–Fri, 9am–6pm",
        },
      },
      social: {
        IR: {
          instagram: "https://instagram.com/stylehub.ir",
          telegram: "https://t.me/stylehub",
        },
        TR: { instagram: "https://instagram.com/stylehub.tr" },
        CA: { instagram: "https://instagram.com/stylehub" },
      },
      legal: {
        companyName: "Style Hub Ticaret A.Ş.",
        registrationNo: "",
        taxNo: "",
        footerLine: {
          fa: "© تمام حقوق محفوظ است.",
          tr: "© Tüm hakları saklıdır.",
          en: "© All rights reserved.",
        },
      },
    },
  });
  await db.themeSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      colors: {
        light: {
          primary: "#E8792A",
          background: "#FBF8F3",
          surface: "#FFFFFF",
          text: "#1A1A1A",
          muted: "#6B6B6B",
          success: "#2E7D4F",
          error: "#C0392B",
          warning: "#B7791F",
        },
        dark: {
          primary: "#F0955A",
          background: "#171310",
          surface: "#221C17",
          text: "#F5F1EA",
          muted: "#B5AA9C",
          success: "#4FAF77",
          error: "#E06655",
          warning: "#D9A441",
        },
      },
      fonts: { fa: "Vazirmatn", latin: "Inter" },
      darkMode: "off",
      headerStyle: "minimal",
      buttonStyle: "pill",
    },
  });
  for (const m of [
    {
      code: "IR",
      name: "Iran",
      currency: "IRT",
      defaultLocale: "fa",
      enabledLocales: ["fa"],
      holdHours: 6,
      fxMode: FxMode.REQUIRE_APPROVAL,
      roundingRule: { mode: "HALF_UP", increment: "1000" },
    },
    {
      code: "TR",
      name: "Türkiye",
      currency: "TRY",
      defaultLocale: "tr",
      enabledLocales: ["tr", "en"],
      holdHours: 3,
      fxMode: FxMode.AUTO_ACCEPT,
      roundingRule: { mode: "HALF_UP", increment: "0.01" },
      announcementBar: {
        enabled: true,
        text: {
          fa: "ارسال رایگان برای سفارش‌های بالای ۲۰۰۰ لیر",
          tr: "2000 TL üzeri siparişlerde ücretsiz kargo",
          en: "Free shipping over 2000 TRY",
        },
      },
    },
    {
      code: "CA",
      name: "Canada",
      currency: "CAD",
      defaultLocale: "en",
      enabledLocales: ["en", "fa"],
      holdHours: 6,
      fxMode: FxMode.AUTO_ACCEPT,
      roundingRule: { mode: "HALF_UP", increment: "0.01" },
    },
  ])
    await db.market.upsert({
      where: { code: m.code },
      update: {},
      create: { ...m, paymentDeadlineHours: 48 },
    });
  await db.integration.upsert({
    where: { key: "storage" },
    update: {},
    create: {
      key: "storage",
      provider: process.env.STORAGE_PROVIDER ?? "local",
      isActive: true,
    },
  });

  await seedContent();

  await seedDemoMedia();
  await seedCatalog();
  await seedPhase03(user.id);
  await seedPhase04();
}

const SEEDED_PAGES = [
  {
    id: "seed-page-about",
    slugI18n: { fa: "درباره-ما", tr: "hakkimizda", en: "about" },
    titleI18n: { fa: "دربارهٔ ما", tr: "Hakkımızda", en: "About us" },
    body: {
      fa: "<p>ما یک فروشگاه نمونهٔ چندزبانه با تمرکز بر تجربه‌ای آرام و شفاف هستیم.</p>",
      tr: "<p>Sade, şeffaf ve çok dilli bir alışveriş deneyimi sunan örnek mağazayız.</p>",
      en: "<p>We are a sample multilingual shop focused on a calm and transparent experience.</p>",
    },
  },
  {
    id: "seed-page-contact",
    slugI18n: { fa: "تماس", tr: "iletisim", en: "contact" },
    titleI18n: { fa: "تماس با ما", tr: "İletişim", en: "Contact" },
    body: {
      fa: "<p>راه‌های تماس از تنظیمات هر بازار نمایش داده می‌شوند.</p>",
      tr: "<p>İletişim bilgileri pazar ayarlarından gösterilir.</p>",
      en: "<p>Contact details are shown from each market's settings.</p>",
    },
  },
  {
    id: "seed-page-terms",
    slugI18n: { fa: "قوانین", tr: "kosullar", en: "terms" },
    titleI18n: { fa: "قوانین و مقررات", tr: "Koşullar", en: "Terms" },
    body: {
      fa: "<p>این متن نمونه است و پیش از راه‌اندازی باید با متن حقوقی تأییدشده جایگزین شود.</p>",
      tr: "<p>Bu örnek metin yayından önce onaylı hukuki metinle değiştirilmelidir.</p>",
      en: "<p>This placeholder must be replaced with approved legal copy before launch.</p>",
    },
  },
  {
    id: "seed-page-privacy",
    slugI18n: { fa: "حریم-خصوصی", tr: "gizlilik", en: "privacy" },
    titleI18n: { fa: "حریم خصوصی", tr: "Gizlilik", en: "Privacy" },
    body: {
      fa: "<p>این صفحه محل درج سیاست حریم خصوصی تأییدشده است.</p>",
      tr: "<p>Onaylı gizlilik politikası burada yayınlanacaktır.</p>",
      en: "<p>The approved privacy policy will be published here.</p>",
    },
  },
  {
    id: "seed-page-returns",
    slugI18n: { fa: "بازگشت-کالا", tr: "iade", en: "returns" },
    titleI18n: { fa: "بازگشت کالا", tr: "İade", en: "Returns" },
    body: {
      fa: "<p>شرایط نهایی بازگشت کالا پیش از راه‌اندازی درج می‌شود.</p>",
      tr: "<p>Nihai iade koşulları yayından önce eklenecektir.</p>",
      en: "<p>Final return conditions will be added before launch.</p>",
    },
  },
  {
    id: "seed-page-size-guide",
    slugI18n: { fa: "راهنمای-سایز", tr: "beden-rehberi", en: "size-guide" },
    titleI18n: { fa: "راهنمای سایز", tr: "Beden rehberi", en: "Size guide" },
    body: {
      fa: "<p>راهنمای اندازه‌گیری و جدول‌های محصول در فاز کاتالوگ تکمیل می‌شوند.</p>",
      tr: "<p>Ölçüm rehberi ürün kataloğu aşamasında tamamlanacaktır.</p>",
      en: "<p>Measurements and product tables will be completed with the catalogue.</p>",
    },
  },
  {
    id: "seed-page-faq",
    slugI18n: { fa: "سوالات-متداول", tr: "sik-sorulan-sorular", en: "faq" },
    titleI18n: {
      fa: "سؤالات متداول",
      tr: "Sık sorulan sorular",
      en: "Frequently asked questions",
    },
    body: {
      fa: "<p>پاسخ پرسش‌های رایج هر بازار در این صفحه قرار می‌گیرد.</p>",
      tr: "<p>Her pazar için sık sorulan sorular burada yer alır.</p>",
      en: "<p>Common questions for each market are collected here.</p>",
    },
  },
] as const;

async function seedContent() {
  for (const page of SEEDED_PAGES) {
    await db.page.upsert({
      where: { id: page.id },
      update: {},
      create: {
        id: page.id,
        slugI18n: page.slugI18n,
        titleI18n: page.titleI18n,
        type: "static",
        status: "published",
        marketIds: [],
        seoI18n: {
          title: page.titleI18n,
          description: { fa: "", tr: "", en: "" },
        },
        blocks: [{ type: "RichText", html: page.body }],
      },
    });
  }

  for (const key of ["header", "mobile", "footer"] as const) {
    const menu = await db.menu.upsert({
      where: { id: `seed-menu-${key}` },
      update: {},
      create: { id: `seed-menu-${key}`, key },
    });
    const pageIds =
      key === "footer"
        ? SEEDED_PAGES.map((page) => page.id)
        : ["seed-page-about", "seed-page-contact"];
    for (const [sortOrder, pageId] of pageIds.entries()) {
      const page = SEEDED_PAGES.find((candidate) => candidate.id === pageId)!;
      await db.menuItem.upsert({
        where: { id: `seed-menu-item-${key}-${pageId}` },
        update: {},
        create: {
          id: `seed-menu-item-${key}-${pageId}`,
          menuId: menu.id,
          labelI18n: page.titleI18n,
          linkType: "page",
          pageId,
          enabled: true,
          sortOrder,
        },
      });
    }
  }

  await db.homepage.upsert({
    where: { id: "seed-homepage-global" },
    update: {},
    create: {
      id: "seed-homepage-global",
      blocks: [
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
      ],
    },
  });

  const templates = [
    {
      key: "auth.otp",
      subject: {
        fa: "کد ورود {{code}}",
        tr: "Giriş kodu {{code}}",
        en: "Sign-in code {{code}}",
      },
      body: {
        fa: "کد شما {{code}} است و {{expiresMinutes}} دقیقه اعتبار دارد.",
        tr: "Kodunuz {{code}}; {{expiresMinutes}} dakika geçerlidir.",
        en: "Your code is {{code}}. It expires in {{expiresMinutes}} minutes.",
      },
    },
    {
      key: "order.placed",
      subject: {
        fa: "سفارش {{orderNumber}} دریافت شد",
        tr: "{{orderNumber}} siparişi alındı",
        en: "Order {{orderNumber}} received",
      },
      body: {
        fa: "{{customerName}} عزیز، سفارش {{orderNumber}} به مبلغ {{total}} دریافت شد.",
        tr: "Merhaba {{customerName}}, {{total}} tutarındaki {{orderNumber}} siparişini aldık.",
        en: "Hello {{customerName}}, we received order {{orderNumber}} for {{total}}.",
      },
    },
    {
      key: "order.receipt_received",
      subject: {
        fa: "رسید سفارش {{orderNumber}} دریافت شد",
        tr: "{{orderNumber}} makbuzu alındı",
        en: "Receipt received for {{orderNumber}}",
      },
      body: {
        fa: "{{customerName}} عزیز، رسید سفارش {{orderNumber}} در حال بررسی است.",
        tr: "Merhaba {{customerName}}, {{orderNumber}} siparişinin makbuzu inceleniyor.",
        en: "Hello {{customerName}}, your receipt for order {{orderNumber}} is under review.",
      },
    },
    {
      key: "order.paid",
      subject: {
        fa: "پرداخت سفارش {{orderNumber}} تأیید شد",
        tr: "{{orderNumber}} ödemesi onaylandı",
        en: "Order {{orderNumber}} paid",
      },
      body: {
        fa: "{{customerName}} عزیز، پرداخت {{total}} برای سفارش {{orderNumber}} تأیید شد.",
        tr: "Merhaba {{customerName}}, {{orderNumber}} için {{total}} ödeme onaylandı.",
        en: "Hello {{customerName}}, payment for {{orderNumber}} ({{total}}) is confirmed.",
      },
    },
    {
      key: "order.rejected",
      subject: {
        fa: "نتیجهٔ بررسی سفارش {{orderNumber}}",
        tr: "{{orderNumber}} ödeme incelemesi",
        en: "Payment review for {{orderNumber}}",
      },
      body: {
        fa: "{{customerName}} عزیز، پرداخت سفارش {{orderNumber}} پذیرفته نشد: {{reason}}.",
        tr: "Merhaba {{customerName}}, {{orderNumber}} ödemesi kabul edilmedi: {{reason}}.",
        en: "Hello {{customerName}}, payment for {{orderNumber}} was not accepted: {{reason}}.",
      },
    },
    {
      key: "order.shipped",
      subject: {
        fa: "سفارش {{orderNumber}} ارسال شد",
        tr: "{{orderNumber}} gönderildi",
        en: "Order {{orderNumber}} shipped",
      },
      body: {
        fa: "{{customerName}} عزیز، سفارش {{orderNumber}} ارسال شد. کد رهگیری: {{trackingNumber}}.",
        tr: "Merhaba {{customerName}}, {{orderNumber}} gönderildi. Takip: {{trackingNumber}}.",
        en: "Hello {{customerName}}, order {{orderNumber}} shipped. Tracking: {{trackingNumber}}.",
      },
    },
    {
      key: "order.delivered",
      subject: {
        fa: "سفارش {{orderNumber}} تحویل شد",
        tr: "{{orderNumber}} teslim edildi",
        en: "Order {{orderNumber}} delivered",
      },
      body: {
        fa: "{{customerName}} عزیز، سفارش {{orderNumber}} تحویل شد.",
        tr: "Merhaba {{customerName}}, {{orderNumber}} teslim edildi.",
        en: "Hello {{customerName}}, order {{orderNumber}} was delivered.",
      },
    },
    {
      key: "order.cancelled",
      subject: {
        fa: "سفارش {{orderNumber}} لغو شد",
        tr: "{{orderNumber}} iptal edildi",
        en: "Order {{orderNumber}} cancelled",
      },
      body: {
        fa: "{{customerName}} عزیز، سفارش {{orderNumber}} لغو شد: {{reason}}.",
        tr: "Merhaba {{customerName}}, {{orderNumber}} iptal edildi: {{reason}}.",
        en: "Hello {{customerName}}, order {{orderNumber}} was cancelled: {{reason}}.",
      },
    },
  ] as const;
  for (const { key, subject, body } of templates) {
    const emailBody = { ...body };
    if (key === "auth.otp") {
      emailBody.fa += "\nلینک ورود: {{loginUrl}}";
      emailBody.tr += "\nGiriş bağlantısı: {{loginUrl}}";
      emailBody.en += "\nSign-in link: {{loginUrl}}";
    }
    if (key === "order.placed") {
      emailBody.fa +=
        "\nرزرو تا {{holdUntil}}؛ پرداخت تا {{deadline}}. پس از پایان رزرو، تأیید به موجودی وابسته است.\n{{bankDetails}}\n{{paymentUrl}}";
      emailBody.tr +=
        "\nStok rezervasyonu: {{holdUntil}}; ödeme: {{deadline}}. Sonrasında onay stok durumuna bağlıdır.\n{{bankDetails}}\n{{paymentUrl}}";
      emailBody.en +=
        "\nStock held until {{holdUntil}}; pay by {{deadline}}. After the hold expires, approval depends on stock availability.\n{{bankDetails}}\n{{paymentUrl}}";
    }
    await db.notificationTemplate.upsert({
      where: { key_channel: { key, channel: "email" } },
      update: {},
      create: {
        key,
        channel: "email",
        subjectI18n: subject,
        bodyI18n: emailBody,
      },
    });
  }
}

// Phase 01b acceptance criterion 9: a fresh `down -v && up --build` seeds
// >=12 demo images across 3 folders with alt text in 3 languages —
// programmatically generated flat-color placeholders (royalty-free, no real
// brand logos), run through the real media-optimize pipeline like any other
// upload (READY once the cron job picks them up after startup).
async function seedDemoMedia() {
  const already = await db.media.count({
    where: { originalName: { startsWith: "seed-" } },
  });
  if (already > 0) return;

  // Seed through the selected provider so LocalStorage and MinIO exercise
  // the same processing pipeline in CI.

  const folders = [
    {
      name: "محصولات",
      altBase: {
        fa: "تصویر نمونه محصول",
        tr: "Örnek ürün görseli",
        en: "Sample product image",
      },
    },
    {
      name: "بنرها",
      altBase: { fa: "بنر نمونه", tr: "Örnek banner", en: "Sample banner" },
    },
    {
      name: "لوگوها",
      altBase: { fa: "لوگوی نمونه", tr: "Örnek logo", en: "Sample logo" },
    },
  ];
  const colors = ["#336699", "#996633", "#669933", "#993366", "#339966"];

  for (const folder of folders) {
    const folderRow = await db.mediaFolder.upsert({
      where: { id: `seed-folder-${folder.name}` },
      update: {},
      create: { id: `seed-folder-${folder.name}`, name: folder.name },
    });

    for (let i = 1; i <= 4; i += 1) {
      const color = colors[(i - 1) % colors.length];
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: color },
      })
        .jpeg()
        .toBuffer();

      const now = new Date();
      const key = `media/${now.getUTCFullYear()}/${String(
        now.getUTCMonth() + 1,
      ).padStart(2, "0")}/${crypto.randomUUID()}.jpg`;
      const url = await putMediaFile(key, buffer);

      const media = await db.media.create({
        data: {
          kind: "image",
          storageKey: key,
          originalName: `seed-${folder.name}-${i}.jpg`,
          url,
          width: 800,
          height: 600,
          bytes: buffer.length,
          mime: "image/jpeg",
          status: "PROCESSING",
          folderId: folderRow.id,
          altI18n: {
            fa: `${folder.altBase.fa} ${i}`,
            tr: `${folder.altBase.tr} ${i}`,
            en: `${folder.altBase.en} ${i}`,
          },
        },
      });
      // Matches src/modules/media/queue.ts's enqueue() — DB-backed Job
      // queue (D21), type must stay in sync with MEDIA_OPTIMIZE_JOB.
      await db.job.create({
        data: { type: "media-optimize", payload: { mediaId: media.id } },
      });
    }
  }
}

async function seedCatalog() {
  const brands = await Promise.all(
    [
      ["atelier", { fa: "آتلیه", tr: "Atölye", en: "Atelier" }],
      ["narin", { fa: "نارین", tr: "Narin", en: "Narin" }],
      ["north", { fa: "نورث", tr: "North", en: "North" }],
    ].map(([slug, nameI18n]) =>
      db.brand.upsert({
        where: { slug: slug as string },
        update: {},
        create: { id: `seed-brand-${slug}`, slug: slug as string, nameI18n },
      }),
    ),
  );
  const categoryRows = [
    ["women", "زنان", "Kadın", "Women", "WOMEN"],
    ["men", "مردان", "Erkek", "Men", "MEN"],
    ["kids", "کودکان", "Çocuk", "Kids", "KIDS"],
    ["accessories", "اکسسوری", "Aksesuar", "Accessories", "UNISEX"],
  ] as const;
  const categories = await Promise.all(
    categoryRows.map(([slug, fa, tr, en, gender], sortOrder) =>
      db.category.upsert({
        where: { id: `seed-category-${slug}` },
        update: {},
        create: {
          id: `seed-category-${slug}`,
          slugI18n: {
            fa:
              slug === "women"
                ? "زنانه"
                : slug === "men"
                  ? "مردانه"
                  : slug === "kids"
                    ? "کودک"
                    : "اکسسوری",
            tr:
              slug === "women"
                ? "kadin"
                : slug === "men"
                  ? "erkek"
                  : slug === "kids"
                    ? "cocuk"
                    : "aksesuar",
            en: slug,
          },
          titleI18n: { fa, tr, en },
          descriptionI18n: {
            fa: `مجموعه ${fa}`,
            tr: `${tr} koleksiyonu`,
            en: `${en} collection`,
          },
          seoI18n: {},
          gender,
          sortOrder,
        },
      }),
    ),
  );
  const subcategories = [
    ["tops", "بالاپوش", "Üst giyim", "Tops"],
    ["bottoms", "پایین‌پوش", "Alt giyim", "Bottoms"],
    ["shoes", "کفش", "Ayakkabı", "Shoes"],
  ] as const;
  for (const root of categories.slice(0, 3))
    for (const [slug, fa, tr, en] of subcategories)
      await db.category.upsert({
        where: { id: `seed-category-${root.id}-${slug}` },
        update: {},
        create: {
          id: `seed-category-${root.id}-${slug}`,
          parentId: root.id,
          slugI18n: {
            fa: `${fa}-${root.gender.toLowerCase()}`,
            tr: `${slug}-${root.gender.toLowerCase()}`,
            en: `${root.gender.toLowerCase()}-${slug}`,
          },
          titleI18n: { fa, tr, en },
          descriptionI18n: { fa, tr, en },
          seoI18n: {},
          gender: root.gender,
          sortOrder: 10,
        },
      });
  const colors = await Promise.all(
    [
      ["BLACK", "#181818", "مشکی", "Siyah", "Black"],
      ["SAND", "#C8A77A", "شنی", "Kum", "Sand"],
      ["RUST", "#A45135", "آجری", "Kiremit", "Rust"],
      ["NAVY", "#1B3155", "سرمه‌ای", "Lacivert", "Navy"],
    ].map(([code, hex, fa, tr, en]) =>
      db.color.upsert({
        where: { code },
        update: {},
        create: {
          id: `seed-color-${code.toLowerCase()}`,
          code,
          hex,
          nameI18n: { fa, tr, en },
        },
      }),
    ),
  );
  const sizes = await Promise.all(
    ["XS", "S", "M", "L", "XL"].map((value, sortOrder) =>
      db.size.upsert({
        where: {
          scale_value_groupKey: { scale: "INTL", value, groupKey: "apparel" },
        },
        update: {},
        create: {
          id: `seed-size-${value.toLowerCase()}`,
          scale: "INTL",
          value,
          groupKey: "apparel",
          sortOrder,
        },
      }),
    ),
  );
  for (const [groupKey, scale, values] of [
    ["tops", "EU", ["36", "38", "40"]],
    ["bottoms", "TR", ["36", "38", "40"]],
    ["shoes", "US", ["7", "8", "9"]],
    ["kids-age", "CA", ["2Y", "4Y", "6Y"]],
  ] as const)
    for (const [sortOrder, value] of values.entries())
      await db.size.upsert({
        where: { scale_value_groupKey: { scale, value, groupKey } },
        update: {},
        create: { scale, value, groupKey, sortOrder },
      });
  const collection = await db.collection.upsert({
    where: { slug: "new-season" },
    update: {},
    create: {
      id: "seed-collection-new",
      slug: "new-season",
      titleI18n: { fa: "فصل جدید", tr: "Yeni sezon", en: "New season" },
    },
  });
  const markets = await db.market.findMany({
    select: { id: true, code: true },
  });
  const media = await db.media.findMany({
    where: { folderId: "seed-folder-محصولات" },
    orderBy: { createdAt: "asc" },
    take: 4,
  });
  for (let index = 1; index <= 30; index += 1) {
    const category = categories[(index - 1) % categories.length];
    const brand = brands[(index - 1) % brands.length];
    const titles = {
      fa: `محصول نمونه ${index}`,
      tr: `Örnek ürün ${index}`,
      en: `Sample product ${index}`,
    };
    const slugs = {
      fa: `محصول-${index}`,
      tr: `urun-${index}`,
      en: `product-${index}`,
    };
    const allowedMarkets =
      index === 30
        ? markets.filter((m) => m.code === "TR").map((m) => m.id)
        : markets.map((m) => m.id);
    const product = await db.product.upsert({
      where: { id: `seed-product-${index}` },
      update: { marketIds: allowedMarkets },
      create: {
        id: `seed-product-${index}`,
        slugI18n: slugs,
        titleI18n: titles,
        descriptionI18n: {
          fa: "محصول نمونه با پارچه باکیفیت و طراحی مینیمال.",
          tr: "Kaliteli kumaş ve sade tasarıma sahip örnek ürün.",
          en: "A sample product with quality fabric and a minimal design.",
        },
        brandId: brand.id,
        categoryId: category.id,
        collections: { connect: { id: collection.id } },
        gender: category.gender,
        material: index % 2 ? "cotton" : "linen",
        fit: "regular",
        season: "all",
        careI18n: {
          fa: "شست‌وشو با آب سرد",
          tr: "Soğuk yıkayın",
          en: "Cold wash",
        },
        originCountry: index % 2 ? "TR" : "IR",
        tags: ["seed", "new"],
        status: "ACTIVE",
        basePriceAmount: String(20 + index),
        basePriceCurrency: "USD",
        weightGrams: 250 + index,
        seoI18n: {
          title: titles,
          description: {
            fa: "خرید محصول نمونه",
            tr: "Örnek ürün",
            en: "Shop sample product",
          },
        },
        marketIds: allowedMarkets,
        searchText: `${titles.fa} ${titles.tr} ${titles.en} seed new`,
      },
    });
    for (let n = 0; n < 2; n += 1) {
      const color = colors[(index + n) % colors.length];
      const size = sizes[(index + n) % sizes.length];
      await db.variant.upsert({
        where: {
          sku: `SH-${String(index).padStart(3, "0")}-${color.code}-${size.value}`,
        },
        update: {
          priceOverrideUsd: index === 1 && n === 1 ? "99" : null,
        },
        create: {
          productId: product.id,
          sku: `SH-${String(index).padStart(3, "0")}-${color.code}-${size.value}`,
          colorId: color.id,
          sizeId: size.id,
          priceOverrideUsd: index === 1 && n === 1 ? "99" : null,
          isActive: true,
        },
      });
    }
    if (media.length) {
      const item = media[(index - 1) % media.length];
      await db.productMedia.upsert({
        where: {
          productId_mediaId: { productId: product.id, mediaId: item.id },
        },
        update: {},
        create: { productId: product.id, mediaId: item.id, sortOrder: 0 },
      });
    }
  }
  await db.sizeGuide.upsert({
    where: { scope_refId: { scope: "category", refId: categories[0].id } },
    update: {},
    create: {
      id: "seed-size-guide-women",
      scope: "category",
      refId: categories[0].id,
      nameI18n: {
        fa: "راهنمای پوشاک",
        tr: "Giyim beden rehberi",
        en: "Apparel size guide",
      },
      unit: "cm",
      tableI18n: {
        columns: ["size", "chest", "waist"],
        rows: [
          ["S", "88", "70"],
          ["M", "94", "76"],
          ["L", "100", "82"],
        ],
      },
    },
  });
}

async function seedPhase03(ownerId: string) {
  await db.integration.upsert({
    where: { key: "fx" },
    update: {},
    create: {
      key: "fx",
      provider: "multi",
      isActive: true,
      config: {
        intlProvider: "frankfurter",
        irtProvider: "navasan",
        navasanField: "usd_sell",
        refreshHours: 6,
      },
    },
  });
  const rates: Record<string, string> = { IR: "60000", TR: "35", CA: "1.40" };
  const markets = await db.market.findMany();
  for (const market of markets) {
    const activeQuote = await db.fxQuote.findFirst({
      where: { marketId: market.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!activeQuote) {
      await db.fxQuote.upsert({
        where: { id: `seed-fx-${market.code}` },
        update: {
          rate: rates[market.code] ?? "1",
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
        create: {
          id: `seed-fx-${market.code}`,
          marketId: market.id,
          baseCurrency: "USD",
          quoteCurrency: market.currency,
          rate: rates[market.code] ?? "1",
          provider: "manual",
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
      });
    }
  }

  const warehouse = await db.warehouse.upsert({
    where: { code: "IST" },
    update: {},
    create: {
      id: "seed-warehouse-istanbul",
      code: "IST",
      nameI18n: {
        fa: "انبار استانبول",
        tr: "İstanbul deposu",
        en: "Istanbul warehouse",
      },
    },
  });
  const variants = await db.variant.findMany({ orderBy: { sku: "asc" } });
  for (const variant of variants) {
    const stock = await db.stockItem.upsert({
      where: {
        warehouseId_variantId: {
          warehouseId: warehouse.id,
          variantId: variant.id,
        },
      },
      update: {},
      create: {
        id: `seed-stock-${variant.id}`,
        warehouseId: warehouse.id,
        variantId: variant.id,
        onHand: 10,
        lowStockThreshold: 2,
      },
    });
    const lot = await db.lot.upsert({
      where: { id: `seed-lot-${variant.id}` },
      update: {},
      create: {
        id: `seed-lot-${variant.id}`,
        warehouseId: warehouse.id,
        variantId: variant.id,
        qtyReceived: 10,
        qtyRemaining: 10,
        unitCostAmount: "500",
        unitCostCurrency: "TRY",
        unitCostAmountTry: "500",
        unitCostAmountUsd: "14.2857",
        fxRateSnapshot: { TRY_PER_USD: "35" },
        receivedAt: new Date("2026-09-09T00:00:00Z"),
      },
    });
    const movement = await db.stockMovement.findFirst({
      where: { lotId: lot.id, type: "IN" },
    });
    if (!movement)
      await db.stockMovement.create({
        data: {
          stockItemId: stock.id,
          warehouseId: warehouse.id,
          variantId: variant.id,
          lotId: lot.id,
          type: "IN",
          quantity: 10,
          reason: "seed",
          createdBy: ownerId,
        },
      });
  }

  const byCode = Object.fromEntries(
    markets.map((market) => [market.code, market]),
  );
  const simulatorVariant = variants[0];
  if (simulatorVariant) {
    await db.variant.update({
      where: { id: simulatorVariant.id },
      data: { weightGrams: 3000 },
    });
    await db.marketPrice.upsert({
      where: { id: "seed-price-ca-simulator" },
      update: {
        marketId: byCode.CA.id,
        variantId: simulatorVariant.id,
        productId: null,
        amount: "200",
        currency: "CAD",
        compareAtAmount: null,
        isActive: true,
        validFrom: new Date(),
        validUntil: null,
      },
      create: {
        id: "seed-price-ca-simulator",
        marketId: byCode.CA.id,
        variantId: simulatorVariant.id,
        amount: "200",
        currency: "CAD",
      },
    });
  }
  const feeRules = [
    {
      id: "seed-fee-tr-shipping",
      marketId: byCode.TR.id,
      labelI18n: {
        fa: "ارسال داخلی ترکیه",
        tr: "Türkiye içi kargo",
        en: "Turkey domestic shipping",
      },
      currency: byCode.TR.currency,
      type: "SHIPPING" as const,
      method: "FIXED" as const,
      params: { amount: "150" },
      minAmount: "150",
    },
    {
      id: "seed-fee-ir-shipping",
      marketId: byCode.IR.id,
      labelI18n: {
        fa: "ارسال وزنی ایران",
        tr: "İran ağırlık kargosu",
        en: "Iran weight shipping",
      },
      currency: byCode.IR.currency,
      type: "SHIPPING" as const,
      method: "PER_KG" as const,
      params: { perKg: "90000", minKg: "1" },
    },
    {
      id: "seed-fee-ca-shipping",
      marketId: byCode.CA.id,
      labelI18n: {
        fa: "ارسال کانادا",
        tr: "Kanada kargo",
        en: "Canada shipping",
      },
      currency: byCode.CA.currency,
      type: "SHIPPING" as const,
      method: "WEIGHT_BRACKET" as const,
      params: { brackets: [{ uptoKg: "2", amount: "20" }], extraPerKg: "6" },
    },
    {
      id: "seed-fee-ca-customs",
      marketId: byCode.CA.id,
      labelI18n: {
        fa: "گمرک کانادا",
        tr: "Kanada gümrük",
        en: "Canada customs",
      },
      currency: byCode.CA.currency,
      type: "CUSTOMS" as const,
      method: "PERCENT" as const,
      params: { percent: "8", of: "subtotal" },
    },
    {
      id: "seed-fee-ca-tax",
      marketId: byCode.CA.id,
      labelI18n: {
        fa: "مالیات نمونه کانادا",
        tr: "Kanada örnek vergi",
        en: "Canada placeholder tax",
      },
      currency: byCode.CA.currency,
      type: "TAX" as const,
      method: "PERCENT" as const,
      params: { percent: "13", of: "subtotal_plus_shipping_customs" },
    },
  ];
  for (const rule of feeRules)
    await db.feeRule.upsert({
      where: { id: rule.id },
      update: {},
      create: { ...rule, priority: 0 },
    });
  await db.feeRule.upsert({
    where: { id: "seed-fee-service-inactive" },
    update: {},
    create: {
      id: "seed-fee-service-inactive",
      marketId: byCode.TR.id,
      labelI18n: {
        fa: "خدمات نمونه",
        tr: "Örnek hizmet",
        en: "Sample service",
      },
      currency: byCode.TR.currency,
      type: "SERVICE",
      method: "PERCENT",
      params: { percent: "2", of: "subtotal" },
      isActive: false,
    },
  });
}
async function seedPhase04() {
  const markets = await db.market.findMany();
  for (const market of markets) {
    await db.marketBankAccount.upsert({
      where: { id: `seed-bank-${market.code}` },
      update: {},
      create: {
        id: `seed-bank-${market.code}`,
        marketId: market.id,
        label: "Demo bank",
        bankName: "Example Bank",
        holder: "Demo Shop",
        accountNumber: `DEMO-${market.code}-0000`,
        instructionsI18n: {
          fa: "این حساب فقط نمونه است؛ واریز واقعی انجام ندهید.",
          tr: "Bu örnek bir hesaptır; gerçek ödeme yapmayın.",
          en: "Demo account only. Do not send real payments.",
        },
      },
    });
  }
  for (const provider of ["stripe", "iyzico", "zarinpal"])
    await db.integration.upsert({
      where: { key: `payment.${provider}` },
      update: {},
      create: { key: `payment.${provider}`, provider, isActive: false },
    });
}
main().finally(() => db.$disconnect());
