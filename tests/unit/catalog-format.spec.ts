import { describe, expect, it } from "vitest";
import { formatCatalogCurrency, toPersianDigits } from "@/modules/catalog";
import { formatStorefrontAmount } from "@/modules/catalog/format";

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

  it("formats high-precision quote strings without converting to Number", () => {
    const amount = "123456789012345678.1200";
    expect(formatStorefrontAmount(amount, "CAD", "en")).toBe(
      "CA$123,456,789,012,345,678.12",
    );
    expect(formatStorefrontAmount("6720000.0000", "IRT", "fa")).toBe(
      "۶٬۷۲۰٬۰۰۰ تومان",
    );
    expect(formatStorefrontAmount("37.1201", "CAD", "en")).toBe("CA$37.1201");
    expect(formatStorefrontAmount("37.5000", "IRT", "fa")).toBe("۳۷٫۵ تومان");
  });

  it("retains the actual currency for unsupported display configurations", () => {
    expect(formatStorefrontAmount("12.3400", "EUR", "en")).toBe("12.34 EUR");
    expect(formatStorefrontAmount("12.3400", "USD", "fr")).toBe("12.34 USD");
  });
});
