import { describe, expect, it } from "vitest";
import { isPwaHomePath } from "@/lib/pwa-home-path";

describe("PWA home-only controls", () => {
  it.each([
    "/fa",
    "/tr/",
    "/en",
    "/fa/m/IR",
    "/tr/m/TR/",
    "/en/m/CA",
    "/en/m/TR",
    "/fa/m/market_2",
  ])("accepts home %s", (path) => {
    expect(isPwaHomePath(path)).toBe(true);
  });
  it.each([
    "/",
    "/admin",
    "/api",
    "/fa/checkout",
    "/tr/cart",
    "/en/account",
    "/fa/orders/1/pay",
    "/fa/m/IR/checkout",
    "/en/m/CA/p/item",
    "/tr/m/TR/c/clothes",
    "/en/m/CA/pages/about",
    "/de/m/TR",
    "/fa/m/",
    "/fa/m/IR//",
    "/fa/m/IR-extra/other",
    `/fa/m/${"x".repeat(41)}`,
  ])("rejects non-home %s", (path) => {
    expect(isPwaHomePath(path)).toBe(false);
  });
});
