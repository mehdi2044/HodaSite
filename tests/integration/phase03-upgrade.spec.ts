import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
const migration = readFileSync(
  "prisma/migrations/20260910120000_phase03_legacy_fx_backfill/migration.sql",
  "utf8",
);
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Phase 02 to 03 FX upgrade without seed",
  () => {
    it("backfills configured rates, preserves active prices and rejects invalid legacy values", async () => {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE "Market" (id text, code text, currency text) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE "Integration" (key text, config jsonb) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE "FxQuote" (LIKE public."FxQuote" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Market" VALUES ('tr','TR','TRY'),('ca','CA','CAD'),('ir','IR','IRT'),('bad','BAD','USD')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Integration" VALUES ('pricing.phase02-test-rates','{"TR":"35","CA":"1.4","IR":"60000","BAD":"invalid"}')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "FxQuote" (id,"marketId","quoteCurrency",rate,provider,status,"acceptedAt") VALUES ('existing','ca','CAD',2,'manual','ACTIVE',CURRENT_TIMESTAMP)`,
        );
        await tx.$executeRawUnsafe(migration);
        await tx.$executeRawUnsafe(migration);
        const rates = await tx.$queryRaw<
          Array<{ marketId: string; rate: string }>
        >`SELECT "marketId",rate::text FROM "FxQuote" ORDER BY "marketId"`;
        expect(rates).toEqual([
          { marketId: "ca", rate: "2.00000000" },
          { marketId: "ir", rate: "60000.00000000" },
          { marketId: "tr", rate: "35.00000000" },
        ]);
      });
    });
  },
);
