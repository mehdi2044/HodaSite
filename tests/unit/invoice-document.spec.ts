import { describe, expect, it, vi } from "vitest";
import {
  invoiceMoney,
  invoiceDate,
  invoiceHtml,
  invoiceSnapshotSchema,
} from "@/modules/orders/invoices/document";
import { purgeOne } from "@/modules/media/purge";
import { invoiceDocument } from "../helpers/invoice";
describe("invoice financial and language boundaries", () => {
  it.each([
    ["en", "99,999,999,999,999.9999"],
    ["tr", "99.999.999.999.999,9999"],
    ["fa", "۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٫۹۹۹۹"],
  ] as const)(
    "preserves exact numeric(18,4) precision in %s",
    (locale, expected) => {
      expect(invoiceMoney("99999999999999.9999", locale)).toBe(expected);
      expect(invoiceMoney("0", locale)).toBe(
        locale === "fa" ? "۰٫۰۰" : locale === "tr" ? "0,00" : "0.00",
      );
    },
  );
  it("uses Jalali dates and Persian digits without changing UTC input", () => {
    expect(invoiceDate("2026-03-21T00:00:00.000Z", "fa")).toContain("۱۴۰۵");
    expect(invoiceDate("2026-03-21T00:00:00.000Z", "fa")).toContain("فروردین");
  });
  it.each(["fa", "tr", "en"] as const)(
    "escapes all dynamic template content in %s",
    (locale) => {
      const d = invoiceDocument(locale);
      d.customer = '<script>fetch("https://example.com/private")</script>';
      d.labels.title = '<img src="file:///etc/passwd">';
      d.items[0].title = '<img src="http://localhost/private">';
      const html = invoiceHtml(d, 1, "", "https://example.com/logo");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain('<img src="');
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain(`dir="${locale === "fa" ? "rtl" : "ltr"}"`);
      expect(html).toContain("script-src 'none'");
    },
  );
  it("rejects invalid monetary inputs and oversized documents", () => {
    expect(() =>
      invoiceSnapshotSchema.parse({ ...invoiceDocument(), total: "NaN" }),
    ).toThrow();
    expect(() =>
      invoiceSnapshotSchema.parse(invoiceDocument("en", 201)),
    ).toThrow();
    expect(() => invoiceMoney("-1", "en")).toThrow();
  });
  it("cannot delete invoice bytes through the generic purge entrypoint", async () => {
    const target = {
      getBytes: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      getSignedUrl: vi.fn(),
    };
    await expect(
      purgeOne(
        { id: "invoice", storageKey: "invoices/i/token.pdf", variants: {} },
        target,
      ),
    ).rejects.toThrow("cannot be purged");
    expect(target.delete).not.toHaveBeenCalled();
  });
});
