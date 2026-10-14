import { beforeAll, afterAll, expect, it, vi, describe } from "vitest";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { saveTheme } from "@/app/admin/(dashboard)/settings/theme/actions";
import { COLOR_KEYS } from "@/lib/theme-defaults";
import { seedModa4BrandMedia } from "../../prisma/moda4-brand";
import { MODA4_LIGHT, MODA4_DARK } from "../../scripts/moda4-theme";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "MODA4 theme real persistence and safety",
  () => {
    let before: Awaited<ReturnType<typeof db.themeSettings.findUniqueOrThrow>>;
    beforeAll(async () => {
      actor.id = (
        await db.user.findFirstOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      before = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
    });
    afterAll(async () => {
      if (before) {
        const { id, createdAt, updatedAt, ...data } = before;
        void createdAt;
        void updatedAt;
        await db.themeSettings.update({
          where: { id },
          data: {
            ...data,
            colors:
              before.colors === null
                ? Prisma.JsonNull
                : (before.colors as Prisma.InputJsonValue),
            fonts:
              before.fonts === null
                ? Prisma.JsonNull
                : (before.fonts as Prisma.InputJsonValue),
          },
        });
      }
    });
    function form() {
      const fd = new FormData();
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
        fd.set(key, value);
      for (const key of COLOR_KEYS) {
        fd.set(`light_${key}`, MODA4_LIGHT[key]);
        fd.set(`dark_${key}`, MODA4_DARK[key]);
      }
      return fd;
    }
    it("saves real role/token/style data and audit; rejects malicious fonts/opacity without a write", async () => {
      expect((await saveTheme(null, form())).ok).toBe(true);
      const saved = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      expect(saved.fonts).toEqual({
        fa: "Vazirmatn",
        latin: "Inter",
        headingLatin: "Manrope",
        priceLatin: "Inter",
      });
      expect(saved.buttonStyle).toBe("crayon");
      expect(saved.colors).toEqual({
        light: MODA4_LIGHT,
        dark: MODA4_DARK,
        opacity: { line: 0.12 },
      });
      const audits = await db.auditLog.count({
        where: { userId: actor.id, action: "settings.theme.update" },
      });
      for (const [key, value] of [
        ["fontHeadingLatin", "Inter;}</style><script>alert(1)</script>"],
        ["fontPriceLatin", "https://example.com/font"],
        ["lineOpacity", "1.01"],
        ["light_line", "#1412101F"],
      ]) {
        const fd = form();
        fd.set(key, value);
        expect((await saveTheme(null, fd)).ok).toBe(false);
        expect(
          await db.themeSettings.findUniqueOrThrow({
            where: { id: "default" },
          }),
        ).toEqual(saved);
      }
      expect(
        await db.auditLog.count({
          where: { userId: actor.id, action: "settings.theme.update" },
        }),
      ).toBe(audits);
    });
    it("does not replace existing seed media or merchant theme/brand on repeated brand imports", async () => {
      const media = await db.media.findMany({
        where: {
          id: { in: ["seed-moda4-brand-logo", "seed-moda4-brand-icon"] },
        },
      });
      expect(media).toHaveLength(2);
      const theme = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      const brand = await db.siteSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      const put = vi.fn(async () => {
        throw new Error("Existing media must not be written");
      });
      await seedModa4BrandMedia(db, put);
      await seedModa4BrandMedia(db, put);
      expect(put).not.toHaveBeenCalled();
      expect(
        await db.media.findMany({
          where: { id: { in: media.map((m) => m.id) } },
        }),
      ).toEqual(media);
      expect(
        await db.themeSettings.findUniqueOrThrow({ where: { id: "default" } }),
      ).toEqual(theme);
      expect(
        await db.siteSettings.findUniqueOrThrow({ where: { id: "default" } }),
      ).toEqual(brand);
    });
  },
);
