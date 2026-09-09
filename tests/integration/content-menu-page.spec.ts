import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getMenu, getPublishedPage } from "@/modules/content";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let marketId = "";
let pageId = "";
let draftPageId = "";
let menuId = "";

describe.skipIf(!hasDb)("cached menu and published page accessors", () => {
  beforeAll(async () => {
    const market = await db.market.create({
      data: {
        code: `X${suffix}`,
        name: "Test",
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
    const page = await db.page.create({
      data: {
        slugI18n: {
          fa: `درباره-${suffix}`,
          tr: `tr-${suffix}`,
          en: `en-${suffix}`,
        },
        titleI18n: { fa: "فارسی", tr: "Türkçe", en: "English" },
        status: "published",
        marketIds: [market.id],
        blocks: [
          {
            type: "RichText",
            html: { fa: "<p>فا</p>", tr: "<p>tr</p>", en: "<p>en</p>" },
          },
        ],
      },
    });
    pageId = page.id;
    const draftPage = await db.page.create({
      data: {
        slugI18n: {
          fa: `draft-fa-${suffix}`,
          tr: `draft-tr-${suffix}`,
          en: `draft-en-${suffix}`,
        },
        titleI18n: { fa: "پیش‌نویس", tr: "Taslak", en: "Draft" },
        status: "draft",
        marketIds: [market.id],
        blocks: [],
      },
    });
    draftPageId = draftPage.id;
    const menu = await db.menu.create({ data: { key: "header", marketId } });
    menuId = menu.id;
    const parent = await db.menuItem.create({
      data: {
        menuId,
        labelI18n: { fa: "والد", tr: "Üst", en: "Parent" },
        linkType: "page",
        pageId,
        visibleIn: [market.code],
        sortOrder: 0,
      },
    });
    await db.menuItem.create({
      data: {
        menuId,
        parentId: parent.id,
        labelI18n: { fa: "فرزند", tr: "Alt", en: "Child" },
        linkType: "url",
        url: "/child",
        visibleIn: [market.code],
        sortOrder: 0,
      },
    });
  });

  afterAll(async () => {
    if (menuId) await db.menu.delete({ where: { id: menuId } });
    if (pageId) await db.page.delete({ where: { id: pageId } });
    if (draftPageId) await db.page.delete({ where: { id: draftPageId } });
    if (marketId) await db.market.delete({ where: { id: marketId } });
  });

  it("resolves localized published page links and two-level nesting", async () => {
    const market = await db.market.findUniqueOrThrow({
      where: { id: marketId },
    });
    const menu = await getMenu("header", marketId, market.code, "en");
    expect(menu).toHaveLength(1);
    expect(menu[0]).toMatchObject({
      label: "Parent",
      href: `/en/pages/en-${suffix}`,
      placeholder: false,
    });
    expect(menu[0].children).toHaveLength(1);
    expect(menu[0].children[0]).toMatchObject({
      label: "Child",
      href: "/child",
    });
  });

  it("returns only a published page visible in the current market", async () => {
    const market = await db.market.findUniqueOrThrow({
      where: { id: marketId },
    });
    expect(
      await getPublishedPage(`en-${suffix}`, "en", market.id),
    ).not.toBeNull();
    expect(
      await getPublishedPage(
        encodeURIComponent(`درباره-${suffix}`),
        "fa",
        market.id,
      ),
    ).not.toBeNull();
    expect(await getPublishedPage(`en-${suffix}`, "en", "OTHER")).toBeNull();
    expect(
      await getPublishedPage(`draft-en-${suffix}`, "en", market.id),
    ).toBeNull();
  });
});
