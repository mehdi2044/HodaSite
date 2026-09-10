import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { shippingFixture, shippingActor } from "../helpers/shipping";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";
const db = new PrismaClient();
async function login(
  page: Page,
  email = process.env.ADMIN_EMAIL ?? "owner@example.com",
  password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!",
) {
  await page.goto("/admin/login");
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
const formFor = (root: Page | Locator, operation: string) =>
  root.locator(`form:has(input[name="operation"][value="${operation}"])`);
async function submit(form: Locator) {
  await form.locator('button:not([type="button"])').last().click();
}
async function change(
  page: Page,
  shipmentId: string,
  index: number,
  status: "IN_TRANSIT" | "DELIVERED",
) {
  const parcel = page.locator(`[data-shipment-id="${shipmentId}"]`);
  const leg = parcel.getByTestId("shipment-leg").nth(index);
  if ((await leg.getAttribute("open")) === null)
    await leg.locator(":scope > summary").click();
  const form = formFor(leg, "saveLeg");
  await form.locator('[name="status"]').selectOption(status);
  if (status === "IN_TRANSIT") {
    await form.locator('[name="carrierName"]').fill("Test carrier");
    await form.locator('[name="trackingNumber"]').fill(`TRACK-${index}`);
    await form
      .locator('[name="trackingUrlTemplate"]')
      .fill("https://example.com/{tracking}");
    await form.locator('[name="costAmount"]').fill("12.3456");
  }
  await submit(form);
  await expect
    .poll(
      async () =>
        (
          await db.shipmentLeg.findFirstOrThrow({
            where: { shipmentId, sortOrder: index },
          })
        ).status,
    )
    .toBe(status);
  // Fresh server values include the new optimistic version and immutable dates.
  await page.reload();
}
test("IR partial parcels, manual event, sequential tracking and final delivery", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await shippingFixture(db, "IR", 2);
  await login(page);
  await page.goto(`/admin/orders/${f.order.number}`);
  const create = formFor(page, "create");
  await create.locator(`[name="qty:${f.order.items[0].id}"]`).fill("1");
  await submit(create);
  await expect(page.getByTestId("shipment")).toHaveCount(1);
  let parcel = await db.shipment.findFirstOrThrow({
    where: { orderId: f.order.id },
  });
  // A forged sequence chosen through the UI must also be denied by the action.
  const later = page.getByTestId("shipment-leg").nth(1);
  await later.locator(":scope > summary").click();
  await formFor(later, "saveLeg")
    .locator('[name="status"]')
    .selectOption("IN_TRANSIT");
  await submit(formFor(later, "saveLeg"));
  await expect(later.getByRole("alert")).toHaveText(
    fa.commerce.errors.SHIPPING_SEQUENCE,
  );
  await page.reload();
  const first = page.getByTestId("shipment-leg").first();
  await first.locator(":scope > summary").click();
  await first.locator("details > summary").click();
  const event = formFor(first, "event");
  await event
    .locator('[name="description"]')
    .fill("Parcel ready for collection");
  await event
    .locator('[name="at"]')
    .fill(new Date().toISOString().slice(0, 16));
  await submit(event);
  await expect(
    first.getByText("Parcel ready for collection", { exact: false }),
  ).toBeVisible();
  await page.reload();
  for (const i of [0, 1]) {
    await change(page, parcel.id, i, "IN_TRANSIT");
    await change(page, parcel.id, i, "DELIVERED");
  }
  await expect(page.getByTestId("admin-order-status")).toHaveText(
    fa.commerce.statuses.SHIPPED,
  );
  await submit(formFor(page, "create"));
  await expect(page.getByTestId("shipment")).toHaveCount(2);
  parcel = await db.shipment.findFirstOrThrow({
    where: { orderId: f.order.id, status: "PENDING" },
  });
  for (const i of [0, 1]) {
    await change(page, parcel.id, i, "IN_TRANSIT");
    await change(page, parcel.id, i, "DELIVERED");
  }
  await expect(page.getByTestId("admin-order-status")).toHaveText(
    fa.commerce.statuses.DELIVERED,
  );
  expect(
    (
      await db.order.findUniqueOrThrow({ where: { id: f.order.id } })
    ).totalAmount.toString(),
  ).toBe(f.order.totalAmount.toString());
  for (const locale of ["fa", "tr", "en"] as const) {
    await page.goto(`/${locale}/tracking`);
    await page.locator('main [name="number"]').fill(f.order.number);
    await page.locator('main [name="email"]').fill(f.email);
    await page
      .getByRole("button", {
        name: { fa, tr, en }[locale].shipping.findTracking,
      })
      .click();
    await expect(
      page.getByTestId("tracking-timeline").locator("article"),
    ).toHaveCount(2);
    await expect(
      page.getByText("Parcel ready for collection", { exact: false }),
    ).toBeVisible();
    expect(
      await page.getByTestId("tracking-timeline").textContent(),
    ).not.toContain("12.3456");
    expect(
      await page
        .getByTestId("tracking-timeline")
        .getByRole("link")
        .first()
        .getAttribute("href"),
    ).toBe("https://example.com/TRACK-0");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator('main [name="email"]').fill("wrong@example.com");
  await page.getByRole("button", { name: en.shipping.findTracking }).click();
  await expect(page.getByRole("alert")).toHaveText(en.shipping.notFound);
  await expect(page.getByTestId("tracking-timeline")).toHaveCount(0);
  expect(page.url()).not.toContain(f.email);
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const response = await page.request.get(
          `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${f.email}`)}`,
        );
        return (
          ((await response.json()) as { messages: unknown[] }).messages
            ?.length ?? 0
        );
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    )
    .toBe(2);
});
test("workflow editor adds, reorders and saves editable market routes", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/settings/shipping");
  await page.getByText(fa.shipping.newWorkflow, { exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="id"][value=""]') });
  const name = `Route ${randomUUID().slice(0, 8)}`;
  for (const k of ["nameFa", "nameTr", "nameEn"])
    await form.locator(`[name="${k}"]`).fill(name);
  const market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  await form.locator('[name="marketId"]').selectOption(market.id);
  for (const label of [fa.shipping.fa, fa.shipping.tr, fa.shipping.en])
    await form
      .getByTestId("workflow-leg")
      .first()
      .getByLabel(`${fa.shipping.legLabel} (${label})`, { exact: true })
      .fill(`First ${label}`);
  await form
    .getByRole("button", { name: fa.shipping.addLeg, exact: true })
    .click();
  const second = form.getByTestId("workflow-leg").nth(1);
  for (const label of [fa.shipping.fa, fa.shipping.tr, fa.shipping.en])
    await second
      .getByLabel(`${fa.shipping.legLabel} (${label})`, { exact: true })
      .fill(`Second ${label}`);
  await second.locator("select").selectOption("INTERNATIONAL");
  await second.getByRole("button", { name: fa.shipping.moveUp }).click();
  await submit(form);
  await expect(form.getByRole("status")).toHaveText(fa.commerce.saved);
  const workflow = await db.shippingWorkflow.findFirstOrThrow({
    where: { marketId: market.id, nameI18n: { path: ["en"], equals: name } },
    include: { legs: { orderBy: { sortOrder: "asc" } } },
  });
  expect(workflow.legs.map((l) => l.type)).toEqual([
    "INTERNATIONAL",
    "DOMESTIC",
  ]);
});
test("TR warehouse sees domestic shipping but cannot fetch IR order or route settings", async ({
  page,
}) => {
  const f = await shippingFixture(db, "TR", 1),
    ir = await shippingFixture(db, "IR", 1);
  const actor = await shippingActor(db, "warehouse", f.market.id);
  const password = `Test-${randomUUID()}`;
  await db.user.update({
    where: { id: actor.id },
    data: { passwordHash: await hash(password, 4) },
  });
  await login(page, actor.email, password);
  await page.goto(`/admin/orders/${f.order.number}`);
  await expect(page.getByTestId("shipping-admin")).toBeVisible();
  await submit(formFor(page, "create"));
  await expect(page.getByTestId("shipment-leg")).toHaveCount(1);
  const leg = await db.shipmentLeg.findFirstOrThrow({
    where: { shipment: { orderId: f.order.id } },
  });
  expect(leg.type).toBe("DOMESTIC");
  await page.goto(`/admin/orders/${ir.order.number}`);
  await expect(page.getByTestId("shipping-admin")).toHaveCount(0);
  await expect(page.getByTestId("admin-order-status")).toHaveCount(0);
  expect(await page.content()).not.toContain(ir.order.id);
  await page.goto("/admin/settings/shipping");
  await expect(page.locator('[name="legs"]')).toHaveCount(0);
});
test.afterAll(async () => db.$disconnect());
