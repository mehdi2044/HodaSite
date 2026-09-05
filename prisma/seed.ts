import { PrismaClient, FxMode } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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

  await seedDemoMedia();
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

  // seed.ts writes files directly (no src/modules/integrations/storage — see
  // the note above); S3 is out of scope for demo data, which only matters
  // for the dev/CI fresh-bring-up case (always STORAGE_PROVIDER=local).
  if (process.env.STORAGE_PROVIDER === "s3") {
    console.warn(
      "[seed] STORAGE_PROVIDER=s3 — skipping demo media seed (local-only).",
    );
    return;
  }

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
      const url = await putLocalMediaFile(key, buffer);

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
