import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getHomepage } from "@/modules/content/homepage";
import { getRuntimeMessages } from "@/modules/content/translations";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let marketId = "";
let globalId = "";
let ownsGlobal = false;
let overrideId = "";
let translationId = "";
let globalBlocks: unknown = [
  { type: "RichText", text: { fa: "سراسری", tr: "Genel", en: "Global" } },
];
const marketBlocks = [
  { type: "RichText", text: { fa: "بازار", tr: "Pazar", en: "Market" } },
];

describe.skipIf(!hasDb)("homepage fallback and runtime UI translations", () => {
  beforeAll(async () => {
    const market = await db.market.create({
      data: {
        code: `H${suffix}`,
        name: "Homepage test",
        currency: "USD",
        defaultLocale: "en",
        enabledLocales: ["en"],
        roundingRule: {},
        holdHours: 1,
        paymentDeadlineHours: 1,
        fxMode: "AUTO_ACCEPT",
      },
    });
    marketId = market.id;
    const existingGlobal = await db.homepage.findFirst({
      where: { marketId: null, deletedAt: null },
    });
    if (existingGlobal) {
      globalId = existingGlobal.id;
      globalBlocks = existingGlobal.blocks;
    } else {
      globalId = (
        await db.homepage.create({ data: { blocks: globalBlocks as object } })
      ).id;
      ownsGlobal = true;
    }
    overrideId = (
      await db.homepage.create({ data: { marketId, blocks: marketBlocks } })
    ).id;
    translationId = (
      await db.translation.create({
        data: {
          entityType: "ui",
          entityId: "global",
          field: "homepage.empty",
          locale: "en",
          value: `Override ${suffix}`,
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (translationId)
      await db.translation.deleteMany({ where: { id: translationId } });
    if (overrideId) await db.homepage.deleteMany({ where: { id: overrideId } });
    if (globalId && ownsGlobal)
      await db.homepage.deleteMany({ where: { id: globalId } });
    if (marketId) await db.market.deleteMany({ where: { id: marketId } });
  });

  it("uses the global composition then the market override", async () => {
    expect((await getHomepage(`no-override-${suffix}`)).blocks).toEqual(
      globalBlocks,
    );
    expect((await getHomepage(marketId)).blocks).toEqual(marketBlocks);
  });

  it("merges a database override without mutating subsequent locale defaults", async () => {
    const overridden = (await getRuntimeMessages("en")) as {
      homepage: { empty: string };
    };
    expect(overridden.homepage.empty).toBe(`Override ${suffix}`);
    const otherLocale = (await getRuntimeMessages("fa")) as {
      homepage: { empty: string };
    };
    expect(otherLocale.homepage.empty).not.toBe(`Override ${suffix}`);
  });
});
