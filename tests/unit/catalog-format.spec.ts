import { describe, expect, it } from "vitest";
import { formatCatalogCurrency, toPersianDigits } from "@/modules/catalog";

describe("catalog locale formatting", () => {
  it("formats toman with Persian digits and grouping", () => {
    expect(formatCatalogCurrency("1890000", "IRT", "fa")).toBe(
      "۱٬۸۹۰٬۰۰۰ تومان",
    );
  });

  it("formats Turkish lira with Turkish separators", () => {
    expect(formatCatalogCurrency("1250", "TRY", "tr")).toBe("₺1.250,00");
  });

  it("formats Canadian dollars and exposes digit conversion", () => {
    expect(formatCatalogCurrency("79.99", "CAD", "en")).toBe("CA$79.99");
    expect(toPersianDigits("2026")).toBe("۲۰۲۶");
  });
});
