import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));
import { db } from "@/lib/db";
import { menuItemInputSchema, getMenu, writeMenuItem } from "@/modules/content";
import { saveMenuItem } from "@/app/admin/(dashboard)/content/menus/actions";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { purgeOne } from "@/modules/media/purge";
import { setMaintenanceFlag } from "@/modules/settings";
import type { StorageProvider } from "@/modules/integrations/storage";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R2 menu persistence/scope/concurrency",
  () => {
    const prefix = `r2-menu-${randomUUID()}`;
    let owner: string,
      scoped: string,
      menu: string,
      other: string,
      category: string,
      media: string,
      market: string,
      code: string;
    const labels = {
      fa: "ویترین پنجم",
      tr: "Beşinci vitrin",
      en: "Fifth world",
    };
    beforeAll(async () => {
      setMaintenanceFlag(false);
      owner = (
        await db.user.findFirstOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      actor.id = owner;
      const m = await db.market.create({
        data: {
          code: `R2${randomUUID().replaceAll("-", "").slice(0, 12)}`,
          name: prefix,
          currency: "CAD",
          defaultLocale: "en",
          enabledLocales: ["fa", "tr", "en"],
          roundingRule: { mode: "HALF_UP", increment: "0.01" },
          holdHours: 6,
          paymentDeadlineHours: 48,
          fxMode: "REQUIRE_APPROVAL",
        },
      });
      market = m.id;
      code = m.code;
      menu = (
        await db.menu.create({ data: { key: "header", marketId: market } })
      ).id;
      other = (
        await db.menu.findFirstOrThrow({
          where: { key: "header", marketId: null, deletedAt: null },
        })
      ).id;
      category = (
        await db.category.create({
          data: {
            gender: "UNISEX",
            titleI18n: labels,
            slugI18n: { fa: prefix, tr: prefix, en: prefix },
          },
        })
      ).id;
      media = (
        await db.media.create({
          data: {
            kind: "image",
            status: "READY",
            storageKey: `media/${prefix}.webp`,
            url: `/media/${prefix}.webp`,
            originalName: prefix,
            mime: "image/webp",
            bytes: 1,
          },
        })
      ).id;
      scoped = (
        await db.user.create({
          data: {
            email: `${prefix}@example.com`,
            passwordHash: "invalid-test-only",
            name: prefix,
          },
        })
      ).id;
      const role = await db.role.create({
        data: {
          key: prefix,
          nameI18n: labels,
          permissions: {
            create: [
              { permission: "content.menu.write" },
              { permission: "content.menu.read" },
            ],
          },
        },
      });
      await db.userRole.create({
        data: { userId: scoped, roleId: role.id, scope: { marketId: market } },
      });
    });
    afterAll(async () => {
      actor.id = owner;
      if (scoped)
        await db.user.update({
          where: { id: scoped },
          data: { isActive: false },
        });
    });
    const input = (extra: Record<string, unknown> = {}) =>
      menuItemInputSchema.parse({
        menuId: menu,
        labelI18n: labels,
        linkType: "category",
        referenceId: category,
        target: "_self",
        enabled: true,
        visibleIn: [],
        sortOrder: 1,
        presentation: {
          version: 1,
          mediaId: media,
          fit: "contain",
          focalX: 0.25,
          focalY: 0.1,
          tone: "sand",
        },
        ...extra,
      });
    const form = (value: ReturnType<typeof input>) => {
      const f = new FormData();
      for (const key of [
        "id",
        "menuId",
        "parentId",
        "linkType",
        "url",
        "pageId",
        "referenceId",
        "expectedUpdatedAt",
      ] as const)
        if (value[key]) f.set(key, value[key]!);
      for (const locale of ["fa", "tr", "en"] as const)
        f.set(
          `label${locale[0].toUpperCase() + locale.slice(1)}`,
          value.labelI18n[locale],
        );
      f.set("target", value.target);
      if (value.enabled) f.set("enabled", "on");
      f.set("sortOrder", String(value.sortOrder));
      for (const [key, data] of Object.entries({
        mediaId: value.presentation?.mediaId,
        imageFit: value.presentation?.fit,
        imageTone: value.presentation?.tone,
        focalX: value.presentation?.focalX,
        focalY: value.presentation?.focalY,
      }))
        if (data !== undefined) f.set(key, String(data));
      return f;
    };
    it("persists real media/category data and resolves every locale to the selected market", async () => {
      expect((await saveMenuItem(null, form(input()))).ok).toBe(true);
      const saved = await db.menuItem.findFirstOrThrow({
        where: { menuId: menu },
      });
      expect(saved.presentation).toMatchObject({
        mediaId: media,
        focalX: 0.25,
        fit: "contain",
      });
      expect(
        await db.auditLog.count({
          where: { entityId: saved.id, action: "content.menu_item.create" },
        }),
      ).toBe(1);
      for (const locale of ["fa", "tr", "en"] as const) {
        const item = (await getMenu("header", market, code, locale)).find(
          (row) => row.id === saved.id,
        )!;
        expect(item.href).toBe(`/${locale}/m/${code}/c/${prefix}`);
        expect(item.image?.id).toBe(media);
        expect(item.placeholder).toBe(false);
      }
    });
    it("allows the granted market and denies a global menu without any write", async () => {
      actor.id = scoped;
      try {
        const own = await saveMenuItem(
          null,
          form(input({ labelI18n: { ...labels, en: "Scoped world" } })),
        );
        expect(own.ok).toBe(true);
        const before = await db.menuItem.count({ where: { menuId: other } });
        const denied = await saveMenuItem(null, form(input({ menuId: other })));
        expect(denied).toMatchObject({ ok: false, code: "FORBIDDEN" });
        expect(await db.menuItem.count({ where: { menuId: other } })).toBe(
          before,
        );
      } finally {
        actor.id = owner;
      }
    });
    it("serializes two edits with one expected revision and retains only one audit", async () => {
      const old = await db.menuItem.findFirstOrThrow({
        where: { menuId: menu },
      });
      const before = await db.auditLog.count({
        where: { entityId: old.id, action: "content.menu_item.update" },
      });
      const edits = ["First window", "Second window"].map((name) =>
        input({
          id: old.id,
          expectedUpdatedAt: old.updatedAt.toISOString(),
          labelI18n: { ...labels, en: name },
        }),
      );
      const result = await Promise.allSettled(
        edits.map((value) => writeMenuItem(owner, value)),
      );
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = result.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failed.reason).toBeInstanceOf(RevisionConflictError);
      expect(
        await db.auditLog.count({
          where: { entityId: old.id, action: "content.menu_item.update" },
        }),
      ).toBe(before + 1);
    });
    it("waits on the real Media lock and rejects deletion that commits first", async () => {
      let release!: () => void, ready!: () => void;
      const hold = new Promise<void>((resolve) => (release = resolve)),
        admitted = new Promise<void>((resolve) => (ready = resolve));
      let pid = 0;
      const blocker = db.$transaction(async (tx) => {
        pid = (
          await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
        )[0].pid;
        await tx.$queryRaw`SELECT id FROM "Media" WHERE id=${media} FOR UPDATE`;
        ready();
        await hold;
        await tx.media.update({
          where: { id: media },
          data: { deletedAt: new Date() },
        });
      });
      await admitted;
      const before = await db.menuItem.count({ where: { menuId: menu } });
      const save = writeMenuItem(owner, input());
      const outcome = save.then(
        () => "saved",
        () => "rejected",
      );
      try {
        let blocked = false;
        for (let n = 0; n < 100 && !blocked; n++) {
          const rows = await db.$queryRaw<
            { blocked: boolean }[]
          >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))) AS blocked`;
          blocked = rows[0].blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
      }
      await blocker;
      expect(await outcome).toBe("rejected");
      expect(await db.menuItem.count({ where: { menuId: menu } })).toBe(before);
      const item = (await getMenu("header", market, code, "en"))[0];
      expect(item.image).toBeUndefined();
      await db.media.update({
        where: { id: media },
        data: { deletedAt: null },
      });
    });
    it("retains media referenced by an archived menu instead of purging its objects", async () => {
      await db.media.update({
        where: { id: media },
        data: { deletedAt: new Date(Date.now() - 90 * 86400000) },
      });
      await db.menu.update({
        where: { id: menu },
        data: { deletedAt: new Date() },
      });
      const row = await db.media.findUniqueOrThrow({ where: { id: media } }),
        remove = vi.fn(async () => {});
      const target = { delete: remove } as unknown as StorageProvider;
      await purgeOne(row, target);
      expect(
        await db.media.findUnique({ where: { id: media } }),
      ).not.toBeNull();
      expect(remove).not.toHaveBeenCalled();
    });
  },
);
