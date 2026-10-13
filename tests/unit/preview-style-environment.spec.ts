import { describe, expect, it } from "vitest";
import { requireLocalPreview } from "../../scripts/lib/preview-style-catalog";

describe("preview-only demo import boundary", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("accepts development preview %s", (APP_URL) => {
    expect(() =>
      requireLocalPreview({ NODE_ENV: "development", APP_URL }),
    ).not.toThrow();
  });
  it.each([
    undefined,
    "",
    "https://shop.example.com",
    "http://localhost.evil.example",
    "not a url",
  ])("rejects other destinations %s", (APP_URL) => {
    expect(() =>
      requireLocalPreview({ NODE_ENV: "development", APP_URL }),
    ).toThrow("local development");
  });
  it("rejects production even on loopback", () => {
    expect(() =>
      requireLocalPreview({
        NODE_ENV: "production",
        APP_URL: "http://localhost:3000",
      }),
    ).toThrow();
  });
});
