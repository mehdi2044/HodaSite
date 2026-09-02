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

// Phase 00 admin permissions (fix-order A2). `owner` also holds "*", but the
// explicit grants are seeded for both so the permission model is exercised
// and an audit of RolePermission shows intent.
const ADMIN_PERMISSIONS = [
  "settings.brand.edit",
  "settings.theme.edit",
  "users.view",
  "users.manage",
  "media.upload",
  "system.health.view",
];
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
  const admin = await db.role.findUniqueOrThrow({ where: { key: "admin" } });
  for (const role of [owner, admin])
    for (const permission of ADMIN_PERMISSIONS)
      await db.rolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission } },
        update: {},
        create: { roleId: role.id, permission },
      });
  await db.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      brand: { fa: "استایل هاب", tr: "STYLE HUB", en: "STYLE HUB" },
      finance: {
        pricingBaseCurrency: "USD",
        functionalCurrency: "TRY",
        reportingCurrency: "USD",
      },
    },
  });
  await db.themeSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      colors: {
        primary: "#E8792A",
        background: "#FBF8F3",
        surface: "#FFFFFF",
        text: "#1A1A1A",
        muted: "#6B6B6B",
      },
      fonts: { fa: "Vazirmatn", latin: "Inter" },
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
