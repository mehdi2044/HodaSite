import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { returnFixture } from "../helpers/returns";
import { defaultConfig } from "../../src/modules/ai/contracts";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
for (const locale of ["fa", "tr", "en"] as const)
  test(`${locale}: AI settings, reviewed fields and disabled assistants on mobile`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const t = { fa, tr, en }[locale].aiAdmin,
      id = randomUUID(),
      email = `ai-browser-${id}@example.com`,
      password = "AiFixture123!";
    const role = await db.role.findUniqueOrThrow({
      where: { key: "data_entry" },
    });
    const user = await db.user.create({
      data: {
        email,
        name: "AI browser fixture",
        passwordHash: await bcrypt.hash(password, 4),
        roles: { create: { roleId: role.id } },
        overrides: {
          create: [
            "ai.settings.manage",
            "ai.usage.view",
            "ai.finance.analyze",
            "finance.report.view",
          ].map((permission) => ({ permission, allow: true })),
        },
      },
    });
    const f = await returnFixture(db, { pending: true });
    const productId = f.variants[0].productId;
    await db.product.update({
      where: { id: productId },
      data: {
        status: "DRAFT",
        titleI18n: {
          fa: `پالتو پشمی ${id}`,
          tr: `Yün palto ${id}`,
          en: `Wool coat ${id}`,
        },
      },
    });
    const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const draft = await db.aiDraft.create({
      data: {
        requestKey: randomUUID(),
        userId: user.id,
        productId,
        productVersion: p.updatedAt,
        facts: {
          input: { title: "Wool coat" },
          categoryIds: [p.categoryId],
          mediaIds: [],
        },
        proposal: {
          fields: [
            { key: "title.en", value: "Reviewed wool coat" },
            { key: "description.en", value: "Do not apply this field" },
          ],
          suggestions: [],
        },
      },
    });
    await db.integration.upsert({
      where: { key: "ai" },
      create: {
        key: "ai",
        provider: "gemini",
        config: defaultConfig,
        isActive: false,
      },
      update: { config: defaultConfig, isActive: false },
    });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin/login");
      await page.locator('[name="email"]').fill(email);
      await page.locator('[name="password"]').fill(password);
      await page
        .getByRole("button", { name: fa.security.login, exact: true })
        .click();
      await expect(page).toHaveURL(/\/admin$/);
      await page.locator('[name="adminLocale"]').selectOption(locale);
      await expect(
        page.locator('aside a[href="/admin/settings/ai"]'),
      ).toHaveText(t.settings);
      await page.goto("/admin/settings/ai");
      await expect(
        page.getByRole("heading", { name: t.settings, exact: true }),
      ).toBeVisible();
      await page.getByLabel(t.settingsConfirm, { exact: true }).check();
      await page.getByRole("button", { name: t.save, exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(t.saved);
      await shoppingProof(page, info, `ai-settings-${locale}`);
      await page.goto("/admin/ai/review");
      const review = page.getByRole("region", { name: t.review });
      await expect(review).toHaveCount(1);
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: productId } }))
          .titleI18n,
      ).toEqual(p.titleI18n);
      await expect(
        review.getByRole("button", { name: t.apply, exact: true }),
      ).toBeDisabled();
      await review
        .getByLabel("title.en", { exact: true })
        .fill("Approved wool coat");
      await review.locator('input[type="checkbox"]').first().check();
      await review.getByLabel(t.confirm, { exact: true }).check();
      await review.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(review.getByRole("status")).toHaveText(t.applied);
      const updated = await db.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(updated.titleI18n).toMatchObject({ en: "Approved wool coat" });
      expect(updated.descriptionI18n).toEqual(p.descriptionI18n);
      expect(updated.basePriceAmount.toString()).toBe(
        p.basePriceAmount.toString(),
      );
      expect(updated.status).toBe("DRAFT");
      await shoppingProof(page, info, `ai-review-${locale}`);
      await page.goto(`/admin/catalog/products/${productId}`);
      await expect(
        page.getByRole("heading", { name: t.assistant, exact: true }),
      ).toBeVisible();
      const assistant = page
        .locator("section")
        .filter({
          has: page.getByRole("heading", { name: t.assistant, exact: true }),
        });
      await assistant
        .getByRole("button", { name: t.generate, exact: true })
        .click();
      await expect(assistant.getByRole("status")).toHaveText(t.errors.DISABLED);
      await shoppingProof(page, info, `ai-editor-${locale}`);
      await page.goto("/admin/finance/analyst");
      await page.getByRole("button", { name: t.analyze, exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(t.errors.DISABLED);
      await page.goto("/admin/ai/usage");
      await expect(
        page.getByRole("heading", { name: t.usage, exact: true }),
      ).toBeVisible();
      await shoppingProof(page, info, `ai-usage-${locale}`);
      expect(
        (await db.aiDraft.findUniqueOrThrow({ where: { id: draft.id } }))
          .status,
      ).toBe("APPLIED");
    } finally {
      await db.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
    }
  });
