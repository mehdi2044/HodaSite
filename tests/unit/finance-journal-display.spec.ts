import { describe, expect, it } from "vitest";
import {
  accountName,
  journalTotals,
  type DisplayLine,
} from "@/modules/finance/journal-display";
describe("ledger presentation precision", () => {
  it("groups original currencies and sums all four decimal places beyond safe integers", () => {
    const line: DisplayLine = {
      accountId: "cash",
      currency: "TRY",
      debit: "99999999999999.9999",
      credit: "0",
      debitTry: "99999999999999.9999",
      creditTry: "0",
      debitUsd: "2499999999999.9999",
      creditUsd: "0",
      rateTry: "1",
      rateUsd: "0.025",
    };
    const totals = journalTotals([
      ...Array<DisplayLine>(1000).fill(line),
      {
        ...line,
        currency: "USD",
        debit: "0.0001",
        debitTry: "0.0040",
        debitUsd: "0.0001",
      },
    ]);
    expect(totals[0]).toMatchObject({
      currency: "TRY",
      debit: "99999999999999999.9000",
    });
    expect(totals[1]).toMatchObject({ currency: "USD", debit: "0.0001" });
    expect(totals[2]).toMatchObject({
      kind: "functional",
      debit: "99999999999999999.9040",
    });
    expect(totals[3]).toMatchObject({
      kind: "reporting",
      debit: "2499999999999999.9001",
    });
  });
  it("uses editable translated account names with safe fallback", () => {
    expect(
      accountName({ code: "bank", nameI18n: { fa: "بانک", en: "Bank" } }, "fa"),
    ).toBe("بانک");
    expect(
      accountName({ code: "bank", nameI18n: { en: "Custom bank" } }, "tr"),
    ).toBe("Custom bank");
    expect(accountName({ code: "bank", nameI18n: null }, "fa")).toBe("bank");
  });
});
