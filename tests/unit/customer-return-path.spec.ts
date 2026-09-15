import { expect, it } from "vitest";
import { customerReturnPath } from "@/lib/customer-return-path";
it.each([
  "//example.net",
  "https://example.net",
  "/admin",
  "/api/health",
  "/en/m/CA/p/%2e%2e",
  "/en/m/CA/p/%2F%2Fevil",
  "/en/m/CA/p/abc%5cevil",
  "/en/m/CA/p/a?next=evil",
  "/en/m/CA/p/a#arbitrary",
  "/en/m/CA/p/a\\evil",
  "/en/m/CA/p/a%0d%0aLocation:evil",
])("rejects unsafe or non-allowlisted return paths: %s", (value) => {
  expect(customerReturnPath(value, "en")).toBe("/en/account");
});
it.each([
  "/en/checkout",
  "/fa/account/wishlist",
  "/tr/orders/TR-123/pay",
  "/fa/m/IR/p/%D9%84%D8%A8%D8%A7%D8%B3",
  "/en/m/CA/p/product-1#stock-alert-cuid123",
])("preserves a safe engagement/payment destination: %s", (value) => {
  expect(customerReturnPath(value, "en")).toBe(value);
});
