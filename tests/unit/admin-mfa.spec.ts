import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Secret } from "otpauth";
import {
  matchingStep,
  recoveryHash,
  requiresMfa,
  totpFor,
} from "@/modules/auth/security";
beforeEach(() => vi.stubEnv("AUTH_SECRET", "mfa-unit-test"));
afterEach(() => vi.unstubAllEnvs());
it("matches the RFC SHA1 vector and rejects malformed or distant OTP values", () => {
  const secret = Secret.fromUTF8("12345678901234567890").base32;
  expect(totpFor(secret).generate({ timestamp: 59000 })).toBe("287082");
  expect(matchingStep(secret, "287082", 59000)).toBe(1n);
  expect(matchingStep(secret, "287082", 150000)).toBeNull();
  expect(matchingStep(secret, "12345", 59000)).toBeNull();
});
it("binds recovery codes to the user and normalizes formatting", () => {
  expect(recoveryHash("u", "abcdef-123456")).toBe(
    recoveryHash("u", "ABCDEF123456"),
  );
  expect(recoveryHash("u", "abcdef-123456")).not.toBe(
    recoveryHash("v", "abcdef-123456"),
  );
});
it("requires MFA for elevated custom roles and overrides", () => {
  const base = { overrides: [], roles: [] };
  expect(requiresMfa(base)).toBe(false);
  expect(
    requiresMfa({
      overrides: [{ allow: true, permission: "users.manage" }],
      roles: [],
    } as Parameters<typeof requiresMfa>[0]),
  ).toBe(true);
  expect(
    requiresMfa({
      overrides: [],
      roles: [{ role: { key: "custom", permissions: [{ permission: "*" }] } }],
    } as Parameters<typeof requiresMfa>[0]),
  ).toBe(true);
});
