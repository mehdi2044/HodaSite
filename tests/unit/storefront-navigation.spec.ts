import { describe, expect, it } from "vitest";
import { storefrontNavigationRoute } from "@/lib/storefront-navigation";
import { safeFloatingNavigation } from "@/lib/theme-validation";

describe("shared storefront navigation presentation contract", () => {
  it.each(["/fa", "/tr/m/TR", "/en/m/CA"])(
    "marks real home active: %s",
    (path) => {
      expect(storefrontNavigationRoute(path)).toMatchObject({
        active: "home",
        suppressed: false,
      });
    },
  );
  it.each([
    ["/fa/m/IR/c/women", "category"],
    ["/tr/search", "category"],
    ["/en/m/CA/p/linen", "product"],
    ["/fa/fitting-room", "fitting"],
    ["/tr/account/login", "login"],
    ["/en/account", "profile"],
  ])("resolves canonical and legacy routes %s", (path, active) => {
    expect(storefrontNavigationRoute(path)).toMatchObject({
      active,
      suppressed: false,
    });
  });
  it.each([
    "/fa/checkout",
    "/tr/m/TR/payment",
    "/en/payments",
    "/en/orders/real-order",
  ])("removes intrusive navigation: %s", (path) => {
    expect(storefrontNavigationRoute(path).suppressed).toBe(true);
  });
  it("keeps cart and account reachable", () => {
    expect(storefrontNavigationRoute("/fa/cart").suppressed).toBe(false);
    expect(storefrontNavigationRoute("/fa/account").suppressed).toBe(false);
  });
  it.each([
    null,
    {},
    { light: {} },
    { navigation: { floatingEnabled: "false" } },
  ])("defaults legacy/invalid JSON safely: %j", (value) => {
    expect(safeFloatingNavigation(value)).toBe(true);
  });
  it.each([true, false])(
    "respects the strict stored boolean %s",
    (floatingEnabled) => {
      expect(safeFloatingNavigation({ navigation: { floatingEnabled } })).toBe(
        floatingEnabled,
      );
    },
  );
});
