import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { shoppingProof } from "./shopping-proof";
import fa from "../../../messages/fa.json";
import tr from "../../../messages/tr.json";
import en from "../../../messages/en.json";
export function journalBrowserFlows() {
  const db = new PrismaClient();
  for (const locale of ["fa", "tr", "en"] as const) {
    test(`${locale}: accountant reviews, posts and reverses an exact journal on mobile`, async ({
      page,
    }, info) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width: 390, height: 844 });
      const t = { fa, tr, en }[locale].journal;
      const market = await db.market.findUniqueOrThrow({
        where: { code: "TR" },
      });
      const role = await db.role.findUniqueOrThrow({
        where: { key: "accountant" },
      });
      const email = `journal-${randomUUID()}@example.com`,
        password = "JournalBrowser123!";
      const user = await db.user.create({
        data: {
          email,
          name: "Ledger browser test",
          passwordHash: await bcrypt.hash(password, 4),
          roles: {
            create: { roleId: role.id, scope: { marketId: market.id } },
          },
        },
      });
      const memo = `Journal ${randomUUID()}`;
      const accounts = await db.ledgerAccount.findMany({
        where: {
          marketId: market.id,
          currency: "TRY",
          code: { in: ["cash", "partner_capital"] },
        },
      });
      try {
        await page.goto("/admin/login");
        await page.locator('[name="email"]').fill(email);
        await page.locator('[name="password"]').fill(password);
        await page.getByRole("button", { name: "ورود امن" }).click();
        await expect(page).toHaveURL(/\/admin$/);
        await page.locator('[name="adminLocale"]').selectOption(locale);
        const ledgerLink = page.locator(
          'aside a[href="/admin/finance/journal"]',
        );
        await expect(ledgerLink).toHaveText(t.title);
        await ledgerLink.click();
        const list = page.getByTestId("journal-list");
        await expect(
          list.getByRole("heading", { name: t.title }),
        ).toBeVisible();
        await list.getByRole("link", { name: t.new }).click();
        const form = page.getByTestId("journal-form");
        await expect(form.locator('[name="marketId"] option')).toHaveText([
          "TR",
        ]);
        await form.locator('[name="memo"]').fill(memo);
        await form.locator('[name="effectiveAt"]').fill("2005-01-15");
        await form.locator('[name="fxAsOf"]').fill("2005-01-15T00:00");
        await form.locator('[name="rateUsd"]').fill("0.025");
        const draft = form.getByTestId("draft-line");
        await draft
          .nth(0)
          .getByRole("combobox")
          .selectOption(accounts.find((a) => a.code === "cash")!.id);
        await draft
          .nth(1)
          .getByRole("combobox")
          .selectOption(accounts.find((a) => a.code === "partner_capital")!.id);
        await draft
          .nth(0)
          .getByLabel(t.debit, { exact: true })
          .fill("100.0001");
        await draft.nth(1).getByLabel(t.credit, { exact: true }).fill("99");
        await form.getByRole("button", { name: t.review, exact: true }).click();
        await expect(form.getByRole("alert")).toHaveText(
          t.errors.UNBALANCED_JOURNAL,
        );
        expect(await db.journalEntry.count({ where: { memo } })).toBe(0);
        await draft
          .nth(1)
          .getByLabel(t.credit, { exact: true })
          .fill("100.0001");
        await form.scrollIntoViewIfNeeded();
        await shoppingProof(page, info, `journal-form-${locale}`);
        await form.getByRole("button", { name: t.review, exact: true }).click();
        const review = form.getByRole("region", { name: t.review });
        await expect(review).toBeVisible();
        await expect(review).toContainText(memo);
        await expect(review.getByTestId("journal-line").first()).toContainText(
          { fa: "۲٫۵۰۰۰", tr: "2,5000", en: "2.5000" }[locale],
        );
        await expect(
          review.getByRole("button", { name: t.post, exact: true }),
        ).toBeDisabled();
        expect(await db.journalEntry.count({ where: { memo } })).toBe(0);
        await review.scrollIntoViewIfNeeded();
        await shoppingProof(page, info, `journal-review-${locale}`);
        await review.getByRole("checkbox").check();
        // Lose the response AFTER the server committed, then retry the same payload.
        let dropped = false;
        if (locale === "en")
          await page.route("**/admin/finance/journal/new", async (route) => {
            if (
              !dropped &&
              route.request().method() === "POST" &&
              route.request().postData()?.includes('"confirm":true')
            ) {
              dropped = true;
              await route.fetch();
              await route.abort("failed");
            } else await route.continue();
          });
        await review.getByRole("button", { name: t.post, exact: true }).click();
        if (locale === "en") {
          await expect(form.getByRole("alert")).toHaveText(t.errors.UNKNOWN);
          await expect(
            review.getByRole("button", { name: t.editDraft }),
          ).toBeDisabled();
          expect(await db.journalEntry.count({ where: { memo } })).toBe(1);
          await db.userRole.deleteMany({ where: { userId: user.id } });
          await review.getByRole("button", { name: t.retrySame }).click();
          await expect(form.getByRole("alert")).toHaveText(t.errors.FORBIDDEN);
          await expect(
            review.getByRole("button", { name: t.editDraft }),
          ).toBeDisabled();
          await db.userRole.create({
            data: {
              userId: user.id,
              roleId: role.id,
              scope: { marketId: market.id },
            },
          });
          await review.getByRole("button", { name: t.retrySame }).click();
        }
        await form.getByRole("link", { name: t.openEntry }).click();
        const detail = page.getByTestId("journal-detail");
        await expect(detail).toContainText(memo);
        const original = await db.journalEntry.findFirstOrThrow({
          where: { memo },
          include: { lines: { orderBy: { position: "asc" } } },
        });
        expect(await db.journalEntry.count({ where: { memo } })).toBe(1);
        expect(original.lines[0].debit.toFixed(4)).toBe("100.0001");
        expect(original.createdById).toBe(user.id);
        await detail.scrollIntoViewIfNeeded();
        await shoppingProof(page, info, `journal-detail-${locale}`);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const reversal = page.getByTestId("journal-reversal");
        await reversal.locator('[name="memo"]').fill(`Reverse ${memo}`);
        await reversal.getByRole("button", { name: t.reviewReversal }).click();
        expect(
          await db.journalEntry.count({ where: { reversalOfId: original.id } }),
        ).toBe(0);
        await reversal.getByRole("button", { name: t.confirmReverse }).click();
        await reversal.getByRole("link", { name: t.openEntry }).click();
        await expect(
          detail.getByRole("link", { name: t.originalEntry }),
        ).toBeVisible();
        await expect(page.getByTestId("journal-reversal")).toHaveCount(0);
        await detail.getByRole("link", { name: t.originalEntry }).click();
        await expect(
          detail.getByRole("link", { name: t.reversalEntry }),
        ).toBeVisible();
        await expect(page.getByTestId("journal-reversal")).toHaveCount(0);
        const undo = await db.journalEntry.findUniqueOrThrow({
          where: { reversalOfId: original.id },
          include: { lines: { orderBy: { position: "asc" } } },
        });
        expect(undo.lines[0].creditUsd.toFixed(4)).toBe("2.5000");
        expect(undo.lines[0].rateUsd.toFixed(12)).toBe(
          original.lines[0].rateUsd.toFixed(12),
        );
        expect(
          (
            await db.journalEntry.findUniqueOrThrow({
              where: { id: original.id },
            })
          ).memo,
        ).toBe(memo);
        await page.goto(
          `/admin/finance/journal?from=2005-01-15&to=2005-01-15&marketId=${market.id}`,
        );
        await expect(
          list.getByRole("link", { name: memo, exact: true }),
        ).toBeVisible();
        const other = await db.market.findUniqueOrThrow({
          where: { code: "IR" },
        });
        await page.goto(`/admin/finance/journal?marketId=${other.id}`);
        await expect(page.getByTestId("journal-list")).toHaveCount(0);
        // Replace post permission with a scoped read-only override: deep links stay guarded.
        await db.userRole.deleteMany({ where: { userId: user.id } });
        await db.userPermissionOverride.create({
          data: {
            userId: user.id,
            permission: "finance.report.view",
            allow: true,
            scope: { marketId: market.id },
          },
        });
        await page.goto(`/admin/finance/journal/${original.id}`);
        await expect(detail).toContainText(memo);
        await page.goto("/admin/finance/journal");
        await expect(list).toBeVisible();
        await expect(list.getByRole("link", { name: t.new })).toHaveCount(0);
        await page.goto("/admin/finance/journal/new");
        await expect(page.getByTestId("journal-form")).toHaveCount(0);
      } finally {
        await db.user.update({
          where: { id: user.id },
          data: { isActive: false },
        });
      }
    });
  }
  test.afterAll(() => db.$disconnect());
}
