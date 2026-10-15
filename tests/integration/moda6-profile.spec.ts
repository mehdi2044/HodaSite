import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const actor = vi.hoisted(() => ({ customer: "", admin: "" }));
vi.mock("@/modules/customers", async () => {
  const { db } = await import("@/lib/db");
  return {
    currentCustomer: async () =>
      actor.customer
        ? db.customer.findUnique({ where: { id: actor.customer } })
        : null,
  };
});
vi.mock("@/modules/auth", () => ({
  auth: async () => (actor.admin ? { user: { id: actor.admin } } : null),
}));
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { saveCustomerPresentation } from "@/modules/customers/presentation";
import {
  requestPrivacy,
  transitionPrivacy,
  exportPersonalData,
} from "@/modules/crm/preferences";
import { saveTheme } from "@/app/admin/(dashboard)/settings/theme/actions";
import { COLOR_KEYS } from "@/lib/theme-defaults";
import { MODA4_LIGHT, MODA4_DARK } from "../../scripts/moda4-theme";
import { setMaintenanceFlag } from "@/modules/settings";
import { purgeOne } from "@/modules/media/purge";
const prefix = `r6-${randomUUID()}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R6 real owner preferences, privacy and media",
  () => {
    let first = "",
      second = "",
      guest = "",
      denied = "",
      size = "",
      category = "",
      market = "";
    let beforeTheme: Awaited<
      ReturnType<typeof db.themeSettings.findUniqueOrThrow>
    >;
    beforeAll(async () => {
      setMaintenanceFlag(false);
      actor.admin = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      const users = [];
      for (const key of ["first", "second", "guest"])
        users.push(
          await db.customer.create({
            data: {
              email: `${prefix}-${key}@example.com`,
              firstName: "Synthetic",
              lastName: key,
              isGuest: key === "guest",
            },
          }),
        );
      [first, second, guest] = users.map((user) => user.id);
      actor.customer = first;
      const m = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      market = m.id;
      const role = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
      denied = (
        await db.user.create({
          data: {
            email: `${prefix}-scoped@example.com`,
            name: "Synthetic scoped theme actor",
            passwordHash: "fixture",
            roles: { create: { roleId: role.id, scope: { marketId: market } } },
          },
        })
      ).id;
      size = (await db.size.findFirstOrThrow({ where: { deletedAt: null } }))
        .id;
      category = (
        await db.category.findFirstOrThrow({ where: { deletedAt: null } })
      ).id;
      beforeTheme = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
    });
    afterAll(async () => {
      if (beforeTheme) {
        const { id, ...data } = beforeTheme;
        await db.themeSettings.update({
          where: { id },
          data: {
            ...data,
            colors: data.colors as Prisma.InputJsonValue,
            fonts: data.fonts as Prisma.InputJsonValue,
          },
        });
      }
      await db.customer.updateMany({
        where: { id: { in: [first, second, guest] } },
        data: { isActive: false },
      });
      if (denied)
        await db.user.update({
          where: { id: denied },
          data: { isActive: false },
        });
    });
    const input = (expectedVersion = 0) => ({
      expectedVersion,
      theme: "ROSE",
      sizeIds: [size],
      categoryIds: [category],
    });
    const digest = async () =>
      JSON.stringify(
        await Promise.all([
          db.customer.findMany({
            where: { id: { in: [first, second] } },
            orderBy: { id: "asc" },
          }),
          db.auditLog.count({
            where: {
              entityId: { in: [first, second] },
              action: "customer.presentation.updated",
            },
          }),
          db.fittingCoinEntry.aggregate({
            _count: { _all: true },
            _sum: { amount: true },
          }),
          db.order.aggregate({
            _count: { _all: true },
            _sum: { totalAmount: true },
          }),
        ]),
      );
    it("rejects anonymous/guest/forged identity and invalid references with no side effects", async () => {
      const before = await digest();
      actor.customer = "";
      await expect(saveCustomerPresentation(input())).rejects.toThrow(
        "LOGIN_REQUIRED",
      );
      actor.customer = guest;
      await expect(saveCustomerPresentation(input())).rejects.toThrow(
        "LOGIN_REQUIRED",
      );
      actor.customer = first;
      await expect(
        saveCustomerPresentation({ ...input(), customerId: second }),
      ).rejects.toThrow();
      await expect(
        saveCustomerPresentation({
          ...input(),
          sizeIds: ["missing-real-size"],
        }),
      ).rejects.toThrow("VALIDATION");
      await expect(
        saveCustomerPresentation({
          ...input(),
          categoryIds: ["missing-real-category"],
        }),
      ).rejects.toThrow("VALIDATION");
      await expect(
        saveCustomerPresentation({ ...input(), theme: "female" }),
      ).rejects.toThrow();
      expect(await digest()).toBe(before);
    });
    it("serializes two real saves, keeps the other owner unchanged and prevents stale/clear ABA writes", async () => {
      actor.customer = first;
      const other = await db.customer.findUniqueOrThrow({
        where: { id: second },
      });
      const results = await Promise.allSettled([
        saveCustomerPresentation(input()),
        saveCustomerPresentation({ ...input(), theme: "SLATE" }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejected.reason.code).toBe("PROFILE_CONFLICT");
      const saved = await db.customer.findUniqueOrThrow({
        where: { id: first },
      });
      expect(saved.presentationVersion).toBe(1);
      expect(["ROSE", "SLATE"]).toContain(saved.profileTheme);
      expect(saved.stylePreferences).toEqual({
        version: 1,
        sizeIds: [size],
        categoryIds: [category],
      });
      expect(
        await db.customer.findUniqueOrThrow({ where: { id: second } }),
      ).toEqual(other);
      expect(
        await db.auditLog.count({
          where: { entityId: first, action: "customer.presentation.updated" },
        }),
      ).toBe(1);
      const request = await requestPrivacy({
        marketId: market,
        kind: "EXPORT",
      });
      const reviewed = await transitionPrivacy({
        id: request.id,
        marketId: market,
        version: request.version,
        status: "IN_REVIEW",
      });
      await transitionPrivacy({
        id: request.id,
        marketId: market,
        version: reviewed.version,
        status: "APPROVED",
      });
      expect((await exportPersonalData(request.id)).profile).toMatchObject({
        profileTheme: saved.profileTheme,
        presentationVersion: 1,
        stylePreferences: saved.stylePreferences,
      });
      actor.customer = second;
      await expect(exportPersonalData(request.id)).rejects.toThrow();
      actor.customer = first;
      await saveCustomerPresentation({ ...input(1), clear: true });
      const cleared = await db.customer.findUniqueOrThrow({
        where: { id: first },
      });
      expect(cleared.profileTheme).toBeNull();
      expect(cleared.stylePreferences).toBeNull();
      expect(cleared.presentationVersion).toBe(2);
      expect(cleared.firstName).toBe(saved.firstName);
      expect(cleared.marketingConsent).toEqual(saved.marketingConsent);
      const unchanged = await digest();
      await expect(saveCustomerPresentation(input())).rejects.toThrow(
        "PROFILE_CONFLICT",
      );
      expect(await digest()).toBe(unchanged);
      expect((await exportPersonalData(request.id)).profile).toMatchObject({
        profileTheme: null,
        stylePreferences: null,
        presentationVersion: 2,
      });
    });
    it("enforces the additive database contract instead of trusting direct JSON/scalar writes", async () => {
      await expect(
        db.$executeRaw`UPDATE "Customer" SET "profileTheme"='female' WHERE id=${first}`,
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`UPDATE "Customer" SET "stylePreferences"='{}'::jsonb WHERE id=${first}`,
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`UPDATE "Customer" SET "presentationVersion"=-1 WHERE id=${first}`,
      ).rejects.toThrow();
      expect(
        (await db.customer.findUniqueOrThrow({ where: { id: first } }))
          .presentationVersion,
      ).toBe(2);
    });
    function themeForm(mediaId?: string) {
      const form = new FormData();
      for (const [key, value] of Object.entries({
        radius: "6px",
        darkMode: "off",
        headerStyle: "minimal",
        buttonStyle: "crayon",
        heroStyle: "editorial",
        fontFa: "Vazirmatn",
        fontLatin: "Inter",
        fontHeadingLatin: "Manrope",
        fontPriceLatin: "Inter",
        lineOpacity: "0.12",
      }))
        form.set(key, value);
      for (const key of COLOR_KEYS) {
        form.set(`light_${key}`, MODA4_LIGHT[key]);
        form.set(`dark_${key}`, MODA4_DARK[key]);
      }
      if (mediaId !== undefined) form.set("accountMediaId", mediaId);
      return form;
    }
    it("uses the real authorized theme save for READY account media, preserves legacy payloads and rejects missing/scoped writes", async () => {
      const owner = actor.admin;
      const media = await db.media.findFirstOrThrow({
        where: { kind: "image", status: "READY", deletedAt: null },
      });
      expect((await saveTheme(null, themeForm(media.id))).ok).toBe(true);
      expect(
        (await db.themeSettings.findUniqueOrThrow({ where: { id: "default" } }))
          .accountMediaId,
      ).toBe(media.id);
      expect((await saveTheme(null, themeForm())).ok).toBe(true);
      const before = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      expect(before.accountMediaId).toBe(media.id);
      const audit = await db.auditLog.count({
        where: { action: "settings.theme.update" },
      });
      expect((await saveTheme(null, themeForm("missing-media"))).ok).toBe(
        false,
      );
      actor.admin = denied;
      expect((await saveTheme(null, themeForm(""))).ok).toBe(false);
      actor.admin = owner;
      expect(
        await db.themeSettings.findUniqueOrThrow({ where: { id: "default" } }),
      ).toEqual(before);
      expect(
        await db.auditLog.count({ where: { action: "settings.theme.update" } }),
      ).toBe(audit);
    });
    it("retains account image objects and metadata after retirement while still referenced by the theme", async () => {
      const media = await db.media.create({
        data: {
          id: `${prefix}-media`,
          kind: "image",
          status: "READY",
          mime: "image/png",
          storageKey: `media/${prefix}.png`,
          originalName: "synthetic-profile-fixture.png",
          url: `/media/${prefix}.png`,
          bytes: 1,
          variants: {},
        },
      });
      const remove = vi.fn(async () => {});
      try {
        expect((await saveTheme(null, themeForm(media.id))).ok).toBe(true);
        const retired = await db.media.update({
          where: { id: media.id },
          data: { deletedAt: new Date(Date.now() - 40 * 86400000) },
        });
        await purgeOne(retired, {
          put: async () => "",
          getSignedUrl: async () => "",
          getBytes: async () => null,
          delete: remove,
        });
        expect(remove).not.toHaveBeenCalled();
        expect(
          await db.media.findUnique({ where: { id: media.id } }),
        ).not.toBeNull();
        expect(
          await db.job.count({
            where: { id: `media-purge-objects:${media.id}` },
          }),
        ).toBe(0);
      } finally {
        await db.themeSettings.update({
          where: { id: "default" },
          data: { accountMediaId: beforeTheme.accountMediaId },
        });
        await db.media.deleteMany({ where: { id: media.id } });
      }
    });
  },
);
