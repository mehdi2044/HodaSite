import { describe, it, expect } from "vitest";
import {
  reportFilter,
  summarizeReports,
  displayReportAmount,
  reportCsv,
  type ReportEvent,
} from "@/modules/finance/reports";
const event = (
  kind: ReportEvent["kind"],
  amount: string,
  more: Partial<ReportEvent> = {},
): ReportEvent => ({
  marketId: "TR",
  currency: "TRY",
  day: "2026-09-01",
  count: "1",
  kind,
  amount,
  ...more,
});
describe("finance transaction report contracts", () => {
  it("uses inclusive UTC days and handles a leap day", () => {
    const f = reportFilter({ from: "2028-02-29", to: "2028-03-01" });
    expect(f.start.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(f.end.toISOString()).toBe("2028-03-02T00:00:00.000Z");
  });
  it.each([
    { from: "2026-02-29" },
    { from: "2026-09-31" },
    { from: "2026-10-01", to: "2026-09-01" },
    { from: "2025-01-01", to: "2026-01-02" },
    { from: ["2026-09-01"] },
    { marketId: ["TR", "IR"] },
  ])("rejects invalid or ambiguous filters %j", (raw) =>
    expect(() => reportFilter(raw)).toThrow(),
  );
  it("defaults to current UTC month and permits exactly 366 days", () => {
    expect(reportFilter({}, new Date("2026-09-12T03:20:00Z"))).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-12",
    });
    expect(() =>
      reportFilter({ from: "2028-01-01", to: "2028-12-31" }),
    ).not.toThrow();
  });
  it("keeps currency/market groups separate and credits out of cash movement", () => {
    const rows = summarizeReports([
      event("paidOrders", "120"),
      event("externalPayments", "100.0001"),
      event("creditPayments", "20"),
      event("externalRefunds", "30.0002", { day: "2026-09-02" }),
      event("creditRefunds", "5"),
      event("externalPayments", "500", { currency: "USD" }),
      event("externalPayments", "700", { marketId: "IR", currency: "IRT" }),
    ]);
    const tr = rows.find((r) => r.marketId === "TR" && r.currency === "TRY")!;
    expect(tr.totals).toMatchObject({
      paidOrders: "120.0000",
      netExternal: "69.9999",
      creditPayments: "20.0000",
      creditRefunds: "5.0000",
      orderCount: "1",
    });
    expect(tr.days[1].totals.netExternal).toBe("-30.0002");
    expect(rows).toHaveLength(3);
  });
  it("does not lose precision beyond JS safe integers and exposes missing dates", () => {
    const rows = summarizeReports([
      event("externalPayments", "99999999999999.9999"),
      event("externalPayments", "0.0001"),
      event("undated", "0", { day: null, count: "2" }),
    ]);
    expect(rows[0].totals.externalPayments).toBe("100000000000000.0000");
    expect(rows[0].totals.undated).toBe("2");
    expect(rows[0].days).toHaveLength(1);
  });
  it("formats exact fractions and negative amounts without rounding", () => {
    expect(displayReportAmount("1234.5678", "fa")).toBe("۱٬۲۳۴٫۵۶۷۸");
    expect(displayReportAmount("-1234.0001", "tr")).toBe("-1.234,0001");
  });
  it("exports the same aggregates and escapes spreadsheet formulas and quotes", () => {
    const rows = summarizeReports([event("externalRefunds", "2.0001")]);
    const csv = reportCsv(rows, [{ id: "TR", code: ' =HYPERLINK("bad")' }], {
      from: "2026-09-01",
      to: "2026-09-02",
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\' =HYPERLINK(""bad"")"');
    expect(csv).toContain('"-2.0001"');
    expect(csv).not.toContain('"\'-2.0001"');
    const formula = reportCsv(rows, [{ id: "TR", code: "-SUM(1,2)" }], {
      from: "2026-09-01",
      to: "2026-09-02",
    });
    expect(formula).toContain('"\'-SUM(1,2)"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});
