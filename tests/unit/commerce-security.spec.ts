import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@prisma/client";
import { assertOrderTransition, deadlinePassed } from "@/modules/orders/state";
import {
  seal,
  unseal,
  opaqueToken,
  tokenHash,
  equalSecret,
} from "@/lib/secure-tokens";
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
import {
  signedReceiptUrl,
  validReceiptSignature,
  OfflineBankTransferProvider,
} from "@/modules/payments";
import { addressSchema } from "@/modules/checkout/validation";
import { purgeOne } from "@/modules/media/purge";
import { getEmailProvider } from "@/modules/notifications";
beforeEach(() => vi.stubEnv("AUTH_SECRET", "unit-commerce-secret"));
afterEach(() => vi.unstubAllEnvs());
describe("order state machine", () => {
  const allowed = new Set([
    "PENDING_PAYMENT:AWAITING_VERIFICATION",
    "PENDING_PAYMENT:PAID",
    "PENDING_PAYMENT:NEEDS_REVIEW",
    "PENDING_PAYMENT:CANCELLED",
    "AWAITING_VERIFICATION:PENDING_PAYMENT",
    "AWAITING_VERIFICATION:PAID",
    "AWAITING_VERIFICATION:NEEDS_REVIEW",
    "AWAITING_VERIFICATION:CANCELLED",
    "NEEDS_REVIEW:PAID",
    "NEEDS_REVIEW:PENDING_PAYMENT",
    "NEEDS_REVIEW:CANCELLED",
    "PAID:PROCESSING",
    "PROCESSING:SHIPPED",
    "SHIPPED:DELIVERED",
  ]);
  it("covers every status pair and forbids reversing paid or final states", () => {
    for (const from of Object.values(OrderStatus))
      for (const to of Object.values(OrderStatus)) {
        if (allowed.has(`${from}:${to}`))
          expect(() => assertOrderTransition(from, to)).not.toThrow();
        else
          expect(() => assertOrderTransition(from, to)).toThrow(
            "INVALID_TRANSITION",
          );
      }
  });
  it("expires exactly at the deadline", () => {
    const now = new Date();
    expect(deadlinePassed(now, now)).toBe(true);
    expect(deadlinePassed(new Date(now.getTime() + 1), now)).toBe(false);
  });
});
describe("private tokens and receipt capabilities", () => {
  it("encrypts queued OTP content and rejects modifications", () => {
    const raw = { to: "customer@example.com", code: "012345" },
      encoded = seal(raw);
    expect(encoded).not.toContain("012345");
    expect(unseal(encoded)).toEqual(raw);
    const pieces = encoded.split(".");
    pieces[pieces.length - 1] = "AAAA";
    expect(() => unseal(pieces.join("."))).toThrow();
    const token = opaqueToken();
    expect(tokenHash(token)).not.toBe(token);
    expect(equalSecret(token, opaqueToken())).toBe(false);
  });
  it("binds signed URLs to a receipt and a maximum ten-minute lifetime", () => {
    const now = Date.now(),
      url = new URL(signedReceiptUrl("r1", now), "https://example.com"),
      expires = url.searchParams.get("expires"),
      sig = url.searchParams.get("signature");
    expect(validReceiptSignature("r1", expires, sig, now)).toBe(true);
    expect(validReceiptSignature("r2", expires, sig, now)).toBe(false);
    expect(validReceiptSignature("r1", expires, sig, now + 600000)).toBe(false);
    expect(validReceiptSignature("r1", expires, sig, now - 61000)).toBe(false);
    expect(validReceiptSignature("r1", null, sig, now)).toBe(false);
    expect(validReceiptSignature("r1", "NaN", sig, now)).toBe(false);
    expect(validReceiptSignature("r1", expires, "a", now)).toBe(false);
  });
  it("never deletes receipt bytes through media purge", async () => {
    const target = {
      delete: vi.fn(),
      put: vi.fn(),
      getBytes: vi.fn(),
      getSignedUrl: vi.fn(),
    };
    await expect(
      purgeOne(
        { id: "r", storageKey: "receipts/2026/r.pdf", variants: {} },
        target,
      ),
    ).rejects.toThrow("cannot be purged");
    expect(target.delete).not.toHaveBeenCalled();
  });
  it("offline provider never self-verifies and unconfigured providers fail closed", async () => {
    expect(await new OfflineBankTransferProvider().verify()).toBe(false);
    expect(() => getEmailProvider("unknown")).toThrow();
  });
});
describe("checkout address validation", () => {
  const base = {
    firstName: "A",
    lastName: "B",
    email: "Buyer@example.com",
    phone: "+1 (555) 000-0000",
    country: "CA",
    province: "ON",
    city: "Toronto",
    line1: "10 Example St",
    postalCode: "M5V 2T6",
  };
  it("normalizes email and accepts a Canadian postal address", () =>
    expect(addressSchema.parse(base).email).toBe("buyer@example.com"));
  it.each([
    { postalCode: "12345" },
    { phone: "hello" },
    { firstName: "" },
    { country: "US" },
  ])("rejects invalid address %j", (change) =>
    expect(addressSchema.safeParse({ ...base, ...change }).success).toBe(false),
  );
});
