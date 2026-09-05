import { PrismaClient, FxMode } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
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
}
main().finally(() => db.$disconnect());
