import { beforeEach, expect, it, vi } from "vitest";
const customer = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/modules/customers", () => ({
  customerSignIn: customer.signIn,
  currentCustomer: async () => null,
  customerSignOut: vi.fn(),
  requestCustomerOtp: vi.fn(),
}));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
import { verifyOtpAction } from "@/app/[locale]/commerce-actions";
beforeEach(() => customer.signIn.mockReset());
it("omits missing credentials so Auth.js URLSearchParams cannot turn them into 'undefined'", async () => {
  const data = new FormData();
  data.set("challengeId", "challenge");
  data.set("code", "012345");
  data.set("next", "/en/checkout");
  expect(await verifyOtpAction("en", data)).toEqual({ url: "/en/checkout" });
  const options = customer.signIn.mock.calls[0][1] as Record<string, string>;
  const encoded = new URLSearchParams(options);
  expect(encoded.get("code")).toBe("012345");
  expect(encoded.has("token")).toBe(false);
});
it("passes only the magic token and rejects an external return URL", async () => {
  const data = new FormData();
  data.set("challengeId", "challenge");
  data.set("token", "a".repeat(64));
  data.set("next", "//example.net");
  expect(await verifyOtpAction("en", data)).toEqual({ url: "/en/account" });
  const encoded = new URLSearchParams(customer.signIn.mock.calls[0][1]);
  expect(encoded.has("code")).toBe(false);
  expect(encoded.get("token")).toBe("a".repeat(64));
});
