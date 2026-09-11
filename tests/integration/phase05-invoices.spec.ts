import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { shippingFixture, shippingActor } from "../helpers/shipping";
import { queueInvoice } from "@/modules/orders/invoices/queue";
import {
  regenerateInvoice,
  invoiceOrder,
  invoiceMarkets,
} from "@/modules/orders/invoices/access";
import { invoiceWorker } from "@/modules/orders/invoices/worker";
import type { StorageProvider } from "@/modules/integrations/storage";
const session = vi.hoisted(() => ({
  admin: null as { user: { id: string } } | null,
  customer: null as { id: string } | null,
  token: "",
}));
vi.mock("@/modules/auth", () => ({ auth: async () => session.admin }));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () => session.customer,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (session.token ? { value: session.token } : undefined),
  }),
}));
class MemoryStorage implements StorageProvider {
  objects = new Map<string, Buffer>();
  async put(key: string, value: Buffer) {
    this.objects.set(key, value);
    return "";
  }
  async getBytes(key: string) {
    return this.objects.get(key) ?? null;
  }
  async getSignedUrl() {
    return "";
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}
const pdf = async () => Buffer.from("%PDF-1.4 test renderer fixture");
const job = (id: string) => ({
  id: "test-invoice-job",
  type: "invoice-generate",
  payload: { invoiceId: id },
  attempts: 0,
});
beforeEach(() => {
  session.admin = null;
  session.customer = null;
  session.token = "";
});
describe.skipIf(!process.env.TEST_DATABASE_URL)("private invoices", () => {
  it("queues atomically once, fences competing requests and retains immutable versions", async () => {
    const { order } = await shippingFixture(db);
    const owner = await shippingActor(db);
    const first = await regenerateInvoice(owner.id, order.id, 0);
    await expect(regenerateInvoice(owner.id, order.id, 0)).rejects.toThrow(
      "INVOICE_STALE",
    );
    const again = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
      return queueInvoice(tx, order.id);
    });
    expect(again.id).toBe(first.id);
    expect(
      await db.job.count({
        where: {
          type: "invoice-generate",
          payload: { path: ["invoiceId"], equals: first.id },
        },
      }),
    ).toBe(1);
    const target = new MemoryStorage();
    const render = vi.fn(pdf);
    await invoiceWorker(job(first.id), target, render);
    await invoiceWorker(job(first.id), target, render);
    expect(render).toHaveBeenCalledTimes(1);
    const ready = await db.invoice.findUniqueOrThrow({
      where: { id: first.id },
      include: { media: true },
    });
    expect(ready.status).toBe("READY");
    expect(ready.media?.url).toBe("");
    await expect(
      db.invoice.update({ where: { id: first.id }, data: { snapshot: {} } }),
    ).rejects.toThrow();
    await expect(
      db.invoice.delete({ where: { id: first.id } }),
    ).rejects.toThrow();
    await expect(
      db.media.update({
        where: { id: ready.mediaId! },
        data: { deletedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      db.media.delete({ where: { id: ready.mediaId! } }),
    ).rejects.toThrow();
    const second = await regenerateInvoice(owner.id, order.id, 1);
    expect(second.version).toBe(2);
    expect((second.snapshot as { total: string }).total).toBe(
      (first.snapshot as { total: string }).total,
    );
    expect(target.objects.size).toBe(1);
  });
  it("keeps a failed renderer retryable without exposing its error data", async () => {
    const { order } = await shippingFixture(db);
    const owner = await shippingActor(db);
    const invoice = await regenerateInvoice(owner.id, order.id, 0);
    const target = new MemoryStorage();
    await expect(
      invoiceWorker(job(invoice.id), target, async () => {
        throw new Error("private@example.com");
      }),
    ).rejects.toThrow("Invoice generation failed");
    expect(
      (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe("FAILED");
    await invoiceWorker(job(invoice.id), target, pdf);
    expect(
      (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe("READY");
  });
  it("only one competing regeneration commits the next version", async () => {
    const { order } = await shippingFixture(db);
    const owner = await shippingActor(db);
    const attempts = await Promise.allSettled([
      regenerateInvoice(owner.id, order.id, 0),
      regenerateInvoice(owner.id, order.id, 0),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(await db.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });
  it("blocks a second worker while the current renderer owns its lease", async () => {
    const { order } = await shippingFixture(db);
    const owner = await shippingActor(db);
    const invoice = await regenerateInvoice(owner.id, order.id, 0);
    const target = new MemoryStorage();
    let started!: () => void, finish!: () => void;
    const signal = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const work = invoiceWorker(job(invoice.id), target, async () => {
      started();
      await gate;
      return pdf();
    });
    await signal;
    try {
      await expect(invoiceWorker(job(invoice.id), target, pdf)).rejects.toThrow(
        "Invoice generation active",
      );
    } finally {
      finish();
    }
    await work;
    expect(target.objects.size).toBe(1);
  });
  it("binds customer and guest access to the particular order", async () => {
    const a = await shippingFixture(db),
      b = await shippingFixture(db);
    expect(await invoiceOrder(a.order.number)).toBeNull();
    session.token = a.guestToken;
    expect((await invoiceOrder(a.order.number))?.id).toBe(a.order.id);
    expect(await invoiceOrder(b.order.number)).toBeNull();
    session.token = "";
    session.customer = { id: a.order.customerId };
    expect((await invoiceOrder(a.order.number))?.id).toBe(a.order.id);
    expect(await invoiceOrder(b.order.number)).toBeNull();
  });
  for (const role of [
    "owner",
    "admin",
    "accountant",
    "warehouse",
    "support",
    "data_entry",
    "marketing",
  ]) {
    for (const code of ["TR", "IR"]) {
      it(`${role} with TR scope: ${code} read and forged regeneration`, async () => {
        const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
        const actor = await shippingActor(db, role, tr.id);
        const { order } = await shippingFixture(db, code);
        const readable =
          code === "TR" && ["owner", "admin", "accountant"].includes(role);
        expect(
          (await invoiceMarkets(actor.id)).some((m) => m.id === order.marketId),
        ).toBe(readable);
        session.admin = { user: { id: actor.id } };
        expect(Boolean(await invoiceOrder(order.number))).toBe(readable);
        const request = regenerateInvoice(actor.id, order.id, 0);
        if (code === "TR" && ["owner", "admin"].includes(role))
          await expect(request).resolves.toMatchObject({ version: 1 });
        else await expect(request).rejects.toThrow("FORBIDDEN");
      });
    }
  }
});
