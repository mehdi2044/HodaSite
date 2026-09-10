import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acceptFxQuote, persistFxRate } from "@/modules/pricing";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
let marketId = "";

describe.skipIf(!hasDb)("FX persistence and jump guard", () => {
  beforeEach(async () => {
    const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
    marketId = market.id;
    await db.fxQuote.deleteMany({ where: { marketId } });
    await db.systemAlert.deleteMany({ where: { code: "FX_JUMP_TR" } });
    await db.fxQuote.create({
      data: {
        marketId,
        quoteCurrency: "TRY",
        rate: "100",
        provider: "manual",
        status: "ACTIVE",
        acceptedAt: new Date("2026-09-10T00:00:00Z"),
      },
    });
  });

  afterEach(async () => {
    await db.fxQuote.deleteMany({ where: { marketId } });
    await db.fxQuote.create({
      data: {
        id: "seed-fx-TR",
        marketId,
        quoteCurrency: "TRY",
        rate: "35",
        provider: "manual",
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    });
    await db.systemAlert.deleteMany({ where: { code: "FX_JUMP_TR" } });
  });

  it("keeps a 12 percent jump suggested until explicit acceptance", async () => {
    const suggested = await persistFxRate({
      base: "USD",
      quote: "TRY",
      rate: "112",
      provider: "frankfurter",
      fetchedAt: new Date(),
    });
    expect(suggested.status).toBe("SUGGESTED");
    const active = await db.fxQuote.findFirstOrThrow({
      where: { marketId, status: "ACTIVE" },
    });
    expect(active.rate.toString()).toBe("100");
    expect(await db.systemAlert.count({ where: { code: "FX_JUMP_TR" } })).toBe(
      1,
    );

    await acceptFxQuote(suggested.id);
    const accepted = await db.fxQuote.findUniqueOrThrow({
      where: { id: suggested.id },
    });
    expect(accepted.status).toBe("ACTIVE");
    expect(accepted.rate.toString()).toBe("112");
  });
});
