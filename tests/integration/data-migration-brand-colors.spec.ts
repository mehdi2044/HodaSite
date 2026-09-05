import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

// Global setup (tests/setup/global-setup.ts) already confirmed
// TEST_DATABASE_URL is reachable when set, or fails the whole run — so
// presence alone is enough here.
const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const MIGRATION_SQL = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260905010000_phase01a_data_migration_brand_colors/migration.sql",
  ),
  "utf8",
);
// $executeRawUnsafe expects one statement at a time — split on statement-
// terminating semicolons (comment lines are stripped first).
const MIGRATION_STATEMENTS = MIGRATION_SQL.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

async function applyMigration() {
  for (const statement of MIGRATION_STATEMENTS) {
    await db.$executeRawUnsafe(statement);
  }
}

// Dedicated rows, never the "default" singleton every other test (and the
// seed) depends on — so this suite can freely leave them in a legacy shape
// without corrupting anything else in the shared test database.
const SITE_ID = "test-data-migration-site";
const THEME_ID = "test-data-migration-theme";

describe.skipIf(!hasDb)(
  "data migration: legacy brand/colors JSON shapes (PR #4 review, P1)",
  () => {
    afterEach(async () => {
      await db.siteSettings.deleteMany({ where: { id: SITE_ID } });
      await db.themeSettings.deleteMany({ where: { id: THEME_ID } });
    });

    it("converts a Phase 00 flat brand into {name,tagline} without losing data", async () => {
      await db.siteSettings.create({
        data: {
          id: SITE_ID,
          brand: { fa: "قدیمی", tr: "Old TR", en: "Old EN" },
          finance: { pricingBaseCurrency: "USD" },
        },
      });

      await applyMigration();

      const row = await db.siteSettings.findUniqueOrThrow({
        where: { id: SITE_ID },
      });
      expect(row.brand).toEqual({
        name: { fa: "قدیمی", tr: "Old TR", en: "Old EN" },
        tagline: { fa: "", tr: "", en: "" },
      });
    });

    it("is idempotent against an already-new-shaped brand", async () => {
      const newShape = {
        name: { fa: "n", tr: "n", en: "n" },
        tagline: { fa: "t", tr: "t", en: "t" },
      };
      await db.siteSettings.create({
        data: { id: SITE_ID, brand: newShape, finance: {} },
      });

      await applyMigration();

      const row = await db.siteSettings.findUniqueOrThrow({
        where: { id: SITE_ID },
      });
      expect(row.brand).toEqual(newShape);
    });

    it("converts a Phase 00 flat colors palette into {light,dark} without losing data", async () => {
      const legacyPalette = {
        primary: "#123456",
        background: "#abcdef",
        surface: "#ffffff",
        text: "#000000",
        muted: "#888888",
      };
      await db.themeSettings.create({
        data: { id: THEME_ID, colors: legacyPalette, fonts: {} },
      });

      await applyMigration();

      const row = await db.themeSettings.findUniqueOrThrow({
        where: { id: THEME_ID },
      });
      const colors = row.colors as {
        light: Record<string, string>;
        dark: Record<string, string>;
      };
      expect(colors.light).toEqual(legacyPalette);
      expect(colors.dark.primary).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("is idempotent against an already-new-shaped colors value", async () => {
      const shape = {
        light: { primary: "#111111" },
        dark: { primary: "#222222" },
      };
      await db.themeSettings.create({
        data: { id: THEME_ID, colors: shape, fonts: {} },
      });

      await applyMigration();

      const row = await db.themeSettings.findUniqueOrThrow({
        where: { id: THEME_ID },
      });
      expect(row.colors).toEqual(shape);
    });
  },
);
