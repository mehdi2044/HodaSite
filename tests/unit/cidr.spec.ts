import { describe, it, expect } from "vitest";
import { ipInCidr, isIpAllowlisted } from "@/lib/cidr";

describe("ipInCidr", () => {
  it("matches an exact IP with no prefix", () => {
    expect(ipInCidr("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(ipInCidr("1.2.3.5", "1.2.3.4")).toBe(false);
  });

  it("matches a /24 range", () => {
    expect(ipInCidr("10.0.0.42", "10.0.0.0/24")).toBe(true);
    expect(ipInCidr("10.0.1.42", "10.0.0.0/24")).toBe(false);
  });

  it("matches /0 (everything) and /32 (exact)", () => {
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(ipInCidr("8.8.8.8", "8.8.8.8/32")).toBe(true);
    expect(ipInCidr("8.8.8.9", "8.8.8.8/32")).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    expect(ipInCidr("not-an-ip", "10.0.0.0/24")).toBe(false);
    expect(ipInCidr("10.0.0.1", "10.0.0.0/99")).toBe(false);
  });

  it("does not attempt IPv6 CIDR matching", () => {
    expect(ipInCidr("::1", "::1/64")).toBe(false);
  });
});

describe("isIpAllowlisted", () => {
  it("is false for a missing IP or empty allowlist", () => {
    expect(isIpAllowlisted(null, ["10.0.0.0/24"])).toBe(false);
    expect(isIpAllowlisted("10.0.0.1", [])).toBe(false);
    expect(isIpAllowlisted("10.0.0.1", undefined)).toBe(false);
  });

  it("is true when any entry matches", () => {
    expect(isIpAllowlisted("10.0.0.5", ["1.1.1.1", "10.0.0.0/24"])).toBe(true);
  });
});
