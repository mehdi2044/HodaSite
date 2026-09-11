import { it, expect } from "vitest";
import { parseStoragePrefix } from "@/modules/integrations/storage/prefix";
it("keeps legacy root keys and accepts only ops generation prefixes", () => {
  expect(parseStoragePrefix("\n")).toBe("");
  expect(
    parseStoragePrefix("_hoda_restore/12345678-1234-1234-1234-123456789abc/\n"),
  ).toBe("_hoda_restore/12345678-1234-1234-1234-123456789abc/");
  for (const value of [
    "../",
    "https://example.com/",
    "media/",
    "_hoda_restore/../",
    "_hoda_restore/a/",
    "_hoda_restore/12345678-1234-1234-1234-123456789abc/extra",
  ])
    expect(() => parseStoragePrefix(value)).toThrow();
});
