import { describe, expect, it } from "vitest";
import {
  flattenMessages,
  getUiTranslationRows,
  isAllowedUiKey,
  isSafeMessageKey,
  parseTranslationImport,
  uiTranslationKeySchema,
  uiTranslationSchema,
} from "@/modules/content/translations";

describe("UI translation overrides", () => {
  it("allows only keys that already exist in file defaults", () => {
    expect(isAllowedUiKey("homepage.empty")).toBe(true);
    expect(isAllowedUiKey("invented.namespace")).toBe(false);
    expect(
      uiTranslationSchema.safeParse({
        locale: "de",
        key: "homepage.empty",
        value: "x",
      }).success,
    ).toBe(false);
    expect(
      uiTranslationKeySchema.safeParse({
        locale: "fa",
        key: "homepage.empty",
      }).success,
    ).toBe(true);
    expect(
      uiTranslationKeySchema.safeParse({
        locale: "fa",
        key: "invented.namespace",
      }).success,
    ).toBe(false);
  });

  it.each(["__proto__.x", "a.prototype.x", "a.constructor.x"])(
    "rejects pollution key %s",
    (key) => {
      expect(isSafeMessageKey(key)).toBe(false);
      expect(
        parseTranslationImport.bind(
          null,
          JSON.stringify({ en: { [key]: "x" } }),
        ),
      ).toThrow();
    },
  );

  it("does not traverse forbidden object paths while flattening", () => {
    const input = JSON.parse(
      '{"safe":{"key":"ok"},"__proto__":{"polluted":"yes"}}',
    ) as unknown;
    expect(flattenMessages(input)).toEqual({ "safe.key": "ok" });
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  it("round-trips a validated partial export and rejects unknown keys", () => {
    const key = getUiTranslationRows()[0].key;
    expect(
      parseTranslationImport(JSON.stringify({ fa: { [key]: "تغییر" } })),
    ).toEqual({ fa: { [key]: "تغییر" } });
    expect(() =>
      parseTranslationImport(JSON.stringify({ en: { "new.key": "bad" } })),
    ).toThrow();
  });

  it("rejects oversized values and imports", () => {
    expect(
      uiTranslationSchema.safeParse({
        locale: "en",
        key: "homepage.empty",
        value: "x".repeat(20_001),
      }).success,
    ).toBe(false);
    expect(() => parseTranslationImport(" ".repeat(1_000_001))).toThrow();
  });

  it("keeps required ICU placeholders and rejects malformed braces", () => {
    expect(
      uiTranslationSchema.safeParse({
        locale: "en",
        key: "media.total",
        value: "Items",
      }).success,
    ).toBe(false);
    expect(
      uiTranslationSchema.safeParse({
        locale: "en",
        key: "media.total",
        value: "{count} products",
      }).success,
    ).toBe(true);
    expect(
      uiTranslationSchema.safeParse({
        locale: "en",
        key: "homepage.empty",
        value: "broken {",
      }).success,
    ).toBe(false);
  });
});
