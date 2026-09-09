import { describe, expect, it } from "vitest";
import { generateSku } from "@/modules/catalog";

describe("catalog SKU generation", () => {
  it("creates a stable uppercase product-color-size SKU", () => {
    expect(generateSku("linen shirt", "navy-blue", "XL")).toBe(
      "LINENSHIRT-NAVYBLUE-XL",
    );
  });

  it("uses safe fallbacks for non-latin or empty parts", () => {
    expect(generateSku("پیراهن", "", "تک")).toBe("ITEM-CLR-ONE");
  });
});
