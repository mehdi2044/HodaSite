import { beforeEach, expect, it, vi } from "vitest";
const customer = vi.hoisted(() => ({ signIn: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
vi.mock("@/modules/customers", () => ({
  customerSignIn: customer.signIn,
  currentCustomer: async () => null,
  customerSignOut: vi.fn(),
  requestCustomerOtp: vi.fn(),
}));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
import { AuthError } from "next-auth";
vi.mock("next/headers", () => ({ headers: customer.headers }));
import { verifyOtpAction } from "@/app/[locale]/commerce-actions";
beforeEach(() => {
  customer.signIn.mockReset();
  customer.headers.mockReset().mockResolvedValue(new Headers());
});
it("omits missing credentials so Auth.js URLSearchParams cannot turn them into 'undefined'", async () => {
  const data = new FormData();
  data.set("challengeId", "challenge");
  data.set("code", "012345");
  data.set("next", "/en/checkout");
  await expect(verifyOtpAction("en", data)).rejects.toThrow(
    "redirect:/en/checkout",
  );
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
  await expect(verifyOtpAction("en", data)).rejects.toThrow(
    "redirect:/en/account",
  );
  const encoded = new URLSearchParams(customer.signIn.mock.calls[0][1]);
  expect(encoded.has("code")).toBe(false);
  expect(encoded.get("token")).toBe("a".repeat(64));
});

it("returns to the authenticated wishlist flow", async () => {
  const form = new FormData();
  form.set("challengeId", "challenge");
  form.set("code", "012345");
  form.set("next", "/en/account/wishlist");
  await expect(verifyOtpAction("en", form)).rejects.toThrow(
    "redirect:/en/account/wishlist",
  );
});

it("uses the request market for the return after OTP", async () => {
  customer.headers.mockResolvedValue(
    new Headers({ "x-hoda-seo-market": "TR" }),
  );
  const form = new FormData();
  form.set("challengeId", "challenge");
  form.set("code", "012345");
  form.set("next", "/en/checkout?market=CA");
  await expect(verifyOtpAction("en", form)).rejects.toThrow(
    "redirect:/en/checkout?market=TR",
  );
});

it("keeps a rejected OTP on the login form", async () => {
  customer.signIn.mockRejectedValue(new AuthError("Rejected"));
  const form = new FormData();
  form.set("challengeId", "challenge");
  form.set("code", "012345");
  form.set("next", "/tr/account/wishlist");
  await expect(verifyOtpAction("tr", form)).resolves.toEqual({
    error: "LOGIN_FAILED",
  });
});
