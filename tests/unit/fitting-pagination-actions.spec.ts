import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  customer: {
    id: "authenticated-customer",
    isGuest: false,
    isActive: true,
  } as { id: string; isGuest: boolean; isActive: boolean } | null,
  enabled: true,
  products: vi.fn(async () => []),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () => state.customer,
}));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: { id: "current-market" } }),
}));
vi.mock("@/modules/fitting", async () => ({
  FittingError: (await import("@/modules/fitting/contracts")).FittingError,
  fittingConfig: async () => ({ enabled: state.enabled }),
  fittingProducts: state.products,
}));
vi.mock("@/modules/cart", () => ({ addCartItems: vi.fn() }));
vi.mock("@/modules/settings", () => ({ isMaintenanceOn: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { loadFittingVariants } from "@/app/[locale]/fitting-room/actions";
const request = {
  marketId: "current-market",
  productId: "garment",
  after: "last-variant",
  owned: false,
};
beforeEach(() => {
  state.customer = {
    id: "authenticated-customer",
    isGuest: false,
    isActive: true,
  };
  state.enabled = true;
  state.products.mockClear();
});
it.each([
  null,
  { id: "guest", isGuest: true, isActive: true },
  { id: "inactive", isGuest: false, isActive: false },
])(
  "denies pagination for an unauthenticated or inactive customer: %j",
  async (customer) => {
    state.customer = customer;
    expect(await loadFittingVariants("fa", request)).toMatchObject({
      ok: false,
      error: "LOGIN_REQUIRED",
    });
    expect(state.products).not.toHaveBeenCalled();
  },
);
it("rejects a market switch without loading prices from the wrong market", async () => {
  expect(
    await loadFittingVariants("fa", { ...request, marketId: "other-market" }),
  ).toMatchObject({ ok: false, error: "REQUEST_CONFLICT" });
  expect(state.products).not.toHaveBeenCalled();
});
it("respects the live fitting kill switch", async () => {
  state.enabled = false;
  expect(await loadFittingVariants("fa", request)).toMatchObject({
    ok: false,
    error: "DISABLED",
  });
  expect(state.products).not.toHaveBeenCalled();
});
it.each([
  { marketId: "current-market", owned: false, after: "cursor" },
  { ...request, variantIds: ["variant"] },
  {
    marketId: "current-market",
    owned: false,
    variantIds: ["1", "2", "3", "4", "5"],
  },
  { ...request, owned: "true" },
  { ...request, customerId: "another-customer" },
  { ...request, afterProduct: "other-product" },
  {
    marketId: "current-market",
    owned: true,
    variantIds: ["v"],
    afterProduct: "other-product",
  },
])("rejects unbounded or conflicting page inputs: %j", async (input) => {
  expect(await loadFittingVariants("fa", input)).toMatchObject({
    ok: false,
    error: "INVALID_SELECTION",
  });
  expect(state.products).not.toHaveBeenCalled();
});
it.each([
  request,
  { marketId: "current-market", owned: true, variantIds: ["saved-variant"] },
  {
    marketId: "current-market",
    owned: false,
    afterProduct: "last-product",
    query: "garment",
  },
])(
  "loads pages and recovered choices only for the authenticated customer: %j",
  async (input) => {
    expect(await loadFittingVariants("fa", input)).toEqual({
      ok: true,
      products: [],
    });
    expect(state.products).toHaveBeenCalledWith(
      "authenticated-customer",
      "current-market",
      "fa",
      "query" in input ? input.query : "",
      input.owned,
      input,
    );
  },
);
