import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const member = vi.hoisted(() => vi.fn());
vi.mock("@/modules/crm/membership", () => ({ requireMember: member }));
import { promotionCustomerEvidence } from "@/modules/crm/promotion-evidence";
const segments = vi.fn(),
  query = vi.fn(),
  customer = vi.fn();
const tx = {
  customer: { findFirst: customer },
  crmSegment: { findMany: segments },
  $queryRaw: query,
  crmProfile: { findUnique: async () => null },
  marketingConsent: { findMany: async () => [] },
  order: { count: async () => 0 },
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.resetAllMocks();
  customer.mockResolvedValue({ id: "customer" });
  query.mockResolvedValue([]);
  segments.mockResolvedValue([]);
});
it("batches 100 predicates with one customer relation and bound values", async () => {
  const payload = "' OR true --";
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: `segment-${i}`,
    definition: { version: 1, rules: [{ field: "tag", value: payload }] },
  }));
  segments.mockResolvedValue(rows);
  query.mockResolvedValue([
    { id: rows[0].id },
    { id: null },
    { id: rows[99].id },
  ]);
  const result = await promotionCustomerEvidence(
    tx,
    "market",
    "customer",
    rows.map((s) => s.id),
  );
  expect(query).toHaveBeenCalledTimes(1);
  const sql = query.mock.calls[0][0] as Prisma.Sql;
  expect(sql.sql.match(/FROM "Customer" c/g)).toHaveLength(1);
  expect(sql.sql.match(/sum\("totalAmountUsd"\)/g)).toHaveLength(1);
  expect(sql.sql).not.toContain(payload);
  expect(sql.values).toEqual(
    expect.arrayContaining([payload, "market", "customer", "segment-99"]),
  );
  expect(result.segmentIds).toEqual([rows[0].id, rows[99].id]);
  expect(segments).toHaveBeenCalledWith({
    where: { id: { in: rows.map((s) => s.id) }, marketId: "market" },
  });
  expect(member).toHaveBeenCalledWith("customer", "market", tx);
});
it("skips segment queries when no relevant segment is requested", async () => {
  expect(
    (await promotionCustomerEvidence(tx, "market", "customer", [])).segmentIds,
  ).toEqual([]);
  expect(segments).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});
it("rejects malformed stored predicates before SQL execution", async () => {
  segments.mockResolvedValue([
    { id: "bad", definition: { version: 2, rules: [] } },
  ]);
  await expect(
    promotionCustomerEvidence(tx, "market", "customer", ["bad"]),
  ).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
it("keeps membership checks ahead of CRM reads", async () => {
  member.mockRejectedValue(new Error("Forbidden"));
  await expect(
    promotionCustomerEvidence(tx, "market", "foreign", ["segment"]),
  ).rejects.toThrow("Forbidden");
  expect(customer).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});
