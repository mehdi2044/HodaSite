import React from "react";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const acting = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.userId ? { user: { id: acting.userId } } : null),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "fa",
  getTranslations: async () =>
    Object.assign((key: string) => key, { has: () => true }),
}));
import { fingerprint, errorCode } from "../helpers/permission-subjects";
import { db } from "@/lib/db";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  granted,
  matrixSubjects,
  form,
  type MatrixSubject,
} from "../helpers/permission-subjects";
import { COLOR_KEYS, DEFAULT_LIGHT_COLORS } from "@/lib/theme-defaults";
import { saveBrand } from "@/app/admin/(dashboard)/settings/brand/actions";
import { saveContact } from "@/app/admin/(dashboard)/settings/contact/actions";
import { saveLegal } from "@/app/admin/(dashboard)/settings/legal/actions";
import { saveSocial } from "@/app/admin/(dashboard)/settings/social/actions";
import { saveTheme } from "@/app/admin/(dashboard)/settings/theme/actions";
import { saveMaintenance } from "@/app/admin/(dashboard)/settings/maintenance/actions";
import { saveHomepage } from "@/app/admin/(dashboard)/content/homepage/actions";
import {
  savePage,
  setPageDeleted,
} from "@/app/admin/(dashboard)/content/pages/actions";
import { saveUiTranslation } from "@/app/admin/(dashboard)/content/translations/actions";
import { saveMenuItem } from "@/app/admin/(dashboard)/content/menus/actions";
import { saveGlobalLowStockThreshold } from "@/app/admin/(dashboard)/inventory/actions";
import {
  saveFxConfiguration,
  saveMarketPrice,
} from "@/app/admin/(dashboard)/pricing/fx/actions";
import { toggleFeeRule } from "@/app/admin/(dashboard)/pricing/fees/actions";
import { setUserActive } from "@/app/admin/(dashboard)/users/actions";
import { revokeSession } from "@/app/admin/(dashboard)/security/actions";
import { saveRole } from "@/app/admin/(dashboard)/security/roles/actions";
import {
  createFolderAction,
  softDeleteMediaAction,
} from "@/app/admin/(dashboard)/media/actions";
import { saveNotificationTemplate } from "@/app/admin/(dashboard)/settings/notifications/actions";
import {
  setProductStatus,
  duplicateProduct,
  quickEditProduct,
} from "@/app/admin/(dashboard)/catalog/products/actions";
import type { ActionResult } from "@/lib/action-result";

type Row = {
  permission: string;
  required?: string[];
  tables?: string[];
  prepare?: () => Promise<void>;
  audit?: boolean;
  run: (forged: boolean) => Promise<unknown>;
};
const call = (
  action: (p: ActionResult | null, f: FormData) => Promise<unknown>,
  values: Record<string, string | string[]>,
  forged: boolean,
) => action(null, form(values, forged));
let snapshotsReady = false;
let subjects: MatrixSubject[] = [],
  marketId = "",
  productId = "",
  categoryId = "",
  menuId = "",
  feeId = "",
  targetUserId = "",
  templateId = "",
  resourceId = "";
let homepage: Awaited<ReturnType<typeof db.homepage.findFirst>>,
  translation: Awaited<ReturnType<typeof db.translation.findFirst>>,
  template: Awaited<ReturnType<typeof db.notificationTemplate.findFirst>>;
let settings: Awaited<ReturnType<typeof db.siteSettings.findUniqueOrThrow>>,
  theme: Awaited<ReturnType<typeof db.themeSettings.findUniqueOrThrow>>,
  integration: Awaited<ReturnType<typeof db.integration.findUnique>>;
const title = (prefix: string, value: string) => ({
  [`${prefix}Fa`]: value,
  [`${prefix}Tr`]: value,
  [`${prefix}En`]: value,
});
const rows: Row[] = [
  {
    permission: "settings.brand.edit",
    run: (f) => call(saveBrand, title("name", "Matrix brand"), f),
  },
  {
    permission: "settings.contact.edit",
    run: (f) => call(saveContact, { email: "matrix@example.com" }, f),
  },
  {
    permission: "settings.legal.edit",
    run: (f) => call(saveLegal, { companyName: "Matrix company" }, f),
  },
  {
    permission: "settings.social.edit",
    run: (f) =>
      call(saveSocial, { TR_instagram: "https://example.com/matrix" }, f),
  },
  {
    permission: "settings.maintenance.edit",
    run: (f) => call(saveMaintenance, { state: "off", messageFa: "Matrix" }, f),
  },
  {
    permission: "settings.theme.edit",
    run: (f) =>
      call(
        saveTheme,
        {
          radius: "12px",
          darkMode: "off",
          headerStyle: "minimal",
          buttonStyle: "pill",
          heroStyle: "editorial",
          fontFa: "Vazirmatn",
          fontLatin: "Inter",
          ...Object.fromEntries(
            COLOR_KEYS.flatMap((k) => [
              [`light_${k}`, DEFAULT_LIGHT_COLORS[k]],
              [`dark_${k}`, DEFAULT_LIGHT_COLORS[k]],
            ]),
          ),
        },
        f,
      ),
  },
  {
    permission: "content.homepage.write",
    run: (f) => call(saveHomepage, { marketId, blocks: "[]" }, f),
  },
  ...["content.page.write", "content.page.publish"].map((permission) => ({
    permission,
    run: (f: boolean) =>
      call(
        savePage,
        {
          ...title("title", "Matrix page"),
          ...title("slug", `matrix-${randomUUID()}`),
          type: "static",
          status: permission.endsWith("publish") ? "published" : "draft",
          blocks: "[]",
        },
        f,
      ),
  })),
  {
    permission: "content.page.delete",
    prepare: async () => {
      const p = await db.page.create({
        data: {
          titleI18n: {},
          slugI18n: {},
          type: "static",
          status: "draft",
          blocks: [],
        },
      });
      resourceId = p.id;
    },
    run: (f) => call(setPageDeleted, { id: resourceId }, f),
  },
  {
    permission: "content.translation.write",
    run: (f) =>
      call(
        saveUiTranslation,
        { locale: "en", key: "catalogAdmin.save", value: "Save" },
        f,
      ),
  },
  {
    permission: "content.menu.write",
    run: (f) =>
      call(
        saveMenuItem,
        {
          menuId,
          ...title("label", "Matrix link"),
          linkType: "url",
          url: "/fa",
          target: "_self",
          enabled: "on",
          sortOrder: "0",
          visibleIn: ["IR", "TR", "CA"],
        },
        f,
      ),
  },
  {
    permission: "inventory.stock.adjust",
    run: (f) => call(saveGlobalLowStockThreshold, { threshold: "3" }, f),
  },
  {
    permission: "pricing.fx.manage",
    run: (f) =>
      call(
        saveFxConfiguration,
        {
          intlProvider: "manual",
          irtProvider: "manual",
          navasanField: "usd_sell",
          refreshHours: "6",
        },
        f,
      ),
  },
  {
    permission: "pricing.sale_price.edit",
    run: (f) =>
      call(
        saveMarketPrice,
        {
          marketId,
          targetType: "product",
          targetId: productId,
          amount: "12.50",
          validFrom: "2020-01-01",
          validUntil: "",
        },
        f,
      ),
  },
  {
    permission: "fees.manage",
    run: (f) => call(toggleFeeRule, { id: feeId }, f),
  },
  {
    permission: "users.manage",
    prepare: async () => {
      await db.user.update({
        where: { id: targetUserId },
        data: { isActive: false },
      });
    },
    run: () => setUserActive(targetUserId, true),
  },
  {
    permission: "security.role.manage",
    run: (f) =>
      saveRole(
        form(
          {
            key: `v4_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
            name: "Matrix empty role",
          },
          f,
        ),
      ),
  },
  {
    permission: "security.session.revoke",
    prepare: async () => {
      const s = await db.adminSession.create({
        data: {
          userId: targetUserId,
          sessionVersion: 0,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      resourceId = s.id;
    },
    run: (f) => revokeSession(form({ id: resourceId }, f)),
  },
  {
    permission: "media.write",
    audit: false,
    run: (f) => createFolderAction(form({ name: `Matrix ${randomUUID()}` }, f)),
  },
  {
    permission: "media.delete",
    prepare: async () => {
      const m = await db.media.create({
        data: {
          kind: "image",
          mime: "image/png",
          storageKey: `media/matrix-${randomUUID()}.png`,
          originalName: "matrix.png",
          url: "/matrix.png",
          bytes: 1,
          status: "READY",
        },
      });
      resourceId = m.id;
    },
    run: (f) => softDeleteMediaAction(form({ mediaId: resourceId }, f)),
  },
  {
    permission: "catalog.product.create",
    run: (f) => call(duplicateProduct, { id: productId }, f),
  },
  {
    permission: "catalog.product.edit",
    run: (f) =>
      call(
        quickEditProduct,
        { id: productId, status: "DRAFT", basePriceAmount: "12" },
        f,
      ),
  },
  {
    permission: "catalog.product.publish",
    required: ["catalog.product.edit"],
    prepare: async () => {
      const p = await db.product.create({
        data: {
          categoryId,
          gender: "UNISEX",
          titleI18n: {},
          slugI18n: {},
          descriptionI18n: {},
          status: "DRAFT",
          basePriceAmount: "1",
        },
      });
      resourceId = p.id;
    },
    run: (f) =>
      call(setProductStatus, { ids: [resourceId], status: "ACTIVE" }, f),
  },
  {
    permission: "settings.notification.write",
    run: (f) =>
      call(
        saveNotificationTemplate,
        {
          id: templateId,
          key: "order.placed",
          isActive: "on",
          ...title("subject", "Matrix subject"),
          ...title("body", "Matrix body"),
        },
        f,
      ),
  },
];
const TABLES: Record<string, string[]> = {
  "settings.brand.edit": ["SiteSettings", "ThemeSettings"],
  "settings.contact.edit": ["SiteSettings"],
  "settings.legal.edit": ["SiteSettings"],
  "settings.social.edit": ["SiteSettings"],
  "settings.maintenance.edit": ["SiteSettings"],
  "settings.theme.edit": ["ThemeSettings"],
  "content.homepage.write": ["Homepage"],
  "content.page.write": ["Page"],
  "content.page.publish": ["Page"],
  "content.page.delete": ["Page"],
  "content.translation.write": ["Translation"],
  "content.menu.write": ["MenuItem"],
  "inventory.stock.adjust": ["SiteSettings"],
  "pricing.fx.manage": ["Integration"],
  "pricing.sale_price.edit": ["MarketPrice"],
  "fees.manage": ["FeeRule"],
  "users.manage": ["User", "UserRole", "AdminSession"],
  "security.role.manage": ["Role", "RolePermission", "User", "AdminSession"],
  "security.session.revoke": ["AdminSession"],
  "media.write": ["MediaFolder"],
  "media.delete": ["Media"],
  "catalog.product.create": [
    "Product",
    "Variant",
    "ProductMedia",
    "ProductAttribute",
  ],
  "catalog.product.edit": ["Product"],
  "catalog.product.publish": ["Product"],
  "settings.notification.write": ["NotificationTemplate"],
};
const auditCount = () =>
  db.auditLog.count({
    where: { userId: { in: subjects.flatMap((s) => (s.id ? [s.id] : [])) } },
  });
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "V-4 real global server actions × subject × scope × submitted/forged payload",
  () => {
    beforeAll(async () => {
      vi.stubGlobal("React", React);
      subjects = await matrixSubjects();
      settings = await db.siteSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      theme = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      integration = await db.integration.findUnique({ where: { key: "fx" } });
      marketId = (await db.market.findUniqueOrThrow({ where: { code: "TR" } }))
        .id;
      categoryId = (await db.category.findFirstOrThrow()).id;
      productId = (
        await db.product.create({
          data: {
            categoryId,
            gender: "UNISEX",
            titleI18n: { en: "Matrix draft" },
            slugI18n: { en: randomUUID() },
            descriptionI18n: {},
            status: "DRAFT",
            basePriceAmount: "12",
          },
        })
      ).id;
      menuId = (
        await db.menu.findFirstOrThrow({
          where: { key: "header", marketId: null, deletedAt: null },
        })
      ).id;
      feeId = (
        await db.feeRule.create({
          data: {
            marketId,
            labelI18n: {},
            type: "SERVICE",
            method: "FIXED",
            params: { amount: "1" },
            currency: "TRY",
            isActive: false,
          },
        })
      ).id;
      const role = await db.role.create({
        data: {
          key: `v4empty${randomUUID().replaceAll("-", "").slice(0, 15)}`,
          nameI18n: {},
        },
      });
      targetUserId = (
        await db.user.create({
          data: {
            email: `matrix-target-${randomUUID()}@example.com`,
            name: "Matrix target",
            passwordHash: "unused",
            roles: { create: { roleId: role.id } },
          },
        })
      ).id;
      template = await db.notificationTemplate.findFirstOrThrow({
        where: { key: "order.placed" },
      });
      templateId = template.id;
      homepage = await db.homepage.findFirst({ where: { marketId } });
      translation = await db.translation.findFirst({
        where: {
          entityType: "ui",
          entityId: "global",
          field: "catalogAdmin.save",
          locale: "en",
        },
      });
      snapshotsReady = true;
    }, 60000);
    afterAll(async () => {
      acting.userId = null;
      if (!snapshotsReady) return;
      if (menuId)
        await db.menuItem.deleteMany({
          where: {
            menuId,
            labelI18n: {
              equals: {
                fa: "Matrix link",
                tr: "Matrix link",
                en: "Matrix link",
              },
            },
          },
        });
      if (settings)
        await db.siteSettings.update({
          where: { id: "default" },
          data: {
            brand: settings.brand!,
            contact: settings.contact!,
            legal: settings.legal!,
            social: settings.social!,
            maintenance: settings.maintenance!,
            inventory: settings.inventory!,
          },
        });
      if (theme) {
        const {
          id: _id,
          createdAt: _created,
          updatedAt: _updated,
          ...data
        } = theme;
        await db.themeSettings.update({
          where: { id: "default" },
          data: { ...data, colors: theme.colors!, fonts: theme.fonts! },
        });
      }
      if (integration)
        await db.integration.update({
          where: { id: integration.id },
          data: { config: integration.config!, isActive: integration.isActive },
        });
      if (homepage)
        await db.homepage.update({
          where: { id: homepage.id },
          data: { blocks: homepage.blocks! },
        });
      else await db.homepage.deleteMany({ where: { marketId } });
      if (translation)
        await db.translation.update({
          where: { id: translation.id },
          data: { value: translation.value },
        });
      else
        await db.translation.deleteMany({
          where: {
            entityType: "ui",
            entityId: "global",
            field: "catalogAdmin.save",
            locale: "en",
          },
        });
      if (template)
        await db.notificationTemplate.update({
          where: { id: template.id },
          data: {
            subjectI18n: template.subjectI18n!,
            bodyI18n: template.bodyI18n!,
            isActive: template.isActive,
          },
        });
    });
    for (const row of rows)
      for (const name of SUBJECTS)
        for (const scope of GLOBAL_SCOPES)
          for (const forged of [false, true]) {
            it(`${row.permission} / ${name} / ${scope} / ${forged ? "direct forged" : "UI action payload"}`, async () => {
              const subject = subjects.find(
                (s) => s.name === name && s.scope === scope,
              )!;
              acting.userId = subject.id;
              const allowed =
                scope === "in" &&
                [row.permission, ...(row.required ?? [])].every((p) =>
                  granted(name, p),
                );
              await row.prepare?.();
              const before = await auditCount();
              const tables = row.tables ?? TABLES[row.permission];
              expect(
                tables,
                "Every operation declares its writable data",
              ).toBeDefined();
              const dataBefore = await fingerprint(tables);
              let result: unknown;
              try {
                result = await row.run(forged);
              } catch (error) {
                result = {
                  ok: false,
                  code: errorCode(error),
                };
              }
              if (allowed) {
                expect(result).not.toMatchObject({ ok: false });
                if (row.audit !== false)
                  expect(await auditCount()).toBeGreaterThan(before);
                expect(await fingerprint(tables)).not.toEqual(dataBefore);
              } else {
                expect(result).toMatchObject({
                  ok: false,
                  code: name === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN",
                });
                if (row.permission === "security.session.revoke") {
                  let hidden: unknown;
                  try {
                    await revokeSession(
                      form({ id: "unknown-session" }, forged),
                    );
                  } catch (error) {
                    hidden = errorCode(error);
                  }
                  expect(hidden).toBe(
                    name === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN",
                  );
                }
                expect(await auditCount()).toBe(before);
                expect(await fingerprint(tables)).toEqual(dataBefore);
              }
            });
          }
  },
);
