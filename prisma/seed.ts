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
    "pricing.cost.view",
    "inventory.stock.adjust",
    "order.view",
    "order.cancel",
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
  warehouse: ["catalog.product.view", "inventory.stock.adjust", "order.view"],
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
    await db.notificationTemplate.upsert({
      where: { key_channel: { key, channel: "email" } },
      update: {},
      create: {
        key,
        channel: "email",
        subjectI18n: subject,
        bodyI18n: body,
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
main().finally(() => db.$disconnect());
