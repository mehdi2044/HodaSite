import { describe, expect, it } from "vitest";
import { normalizeJournal, journalHash } from "@/modules/finance/journal-input";
const request = () => ({
  marketId: "TR",
  requestKey: "test-1",
  memo: "Opening entry",
  effectiveAt: "2026-09-13T00:00:00Z",
  fxAsOf: "2026-09-13T00:00:00Z",
  lines: [
    {
      accountId: "cash",
      currency: "TRY",
      debit: "100.0001",
      credit: "0",
      rateTry: "1",
      rateUsd: "0.025",
    },
    {
      accountId: "capital",
      currency: "TRY",
      debit: "0",
      credit: "100.0001",
      rateTry: "1",
      rateUsd: "0.025",
    },
  ],
});
describe("persisted journal input", () => {
  it("calculates exact four-decimal snapshots and canonical retry hashes", () => {
    const a = request(),
      b = request();
    b.lines[0].rateTry = "1.0000";
    b.lines[1].debit = "0.0000";
    const normalized = normalizeJournal(a);
    expect(normalized.lines[0]).toMatchObject({
      debit: "100.0001",
      debitTry: "100.0001",
      debitUsd: "2.5000",
    });
    expect(journalHash(normalized)).toBe(journalHash(normalizeJournal(b)));
  });
  it("preserves amounts beyond safe JS integer precision", () => {
    const r = request();
    r.lines[0].debit = r.lines[1].credit = "99999999999999.9999";
    expect(normalizeJournal(r).lines[0].debitTry).toBe("99999999999999.9999");
  });
  it.each(["0", "-1", "NaN", "Infinity", "1e2", "0.0000000000001"])(
    "rejects invalid rate %s",
    (rate) => {
      const r = request();
      r.lines[0].rateUsd = rate;
      expect(() => normalizeJournal(r)).toThrow();
    },
  );
  it.each(["-1", "0.00001", "NaN", "1e2", "100000000000000", "1,000"])(
    "rejects invalid amount %s",
    (value) => {
      const r = request();
      r.lines[0].debit = value;
      expect(() => normalizeJournal(r)).toThrow();
    },
  );
  it("rejects zero/both sides, missing lines and forged actor fields", () => {
    const r = request();
    r.lines[0].debit = "0";
    expect(() => normalizeJournal(r)).toThrow("INVALID_JOURNAL_SIDE");
    r.lines[0].debit = r.lines[0].credit = "1";
    expect(() => normalizeJournal(r)).toThrow("INVALID_JOURNAL_SIDE");
    expect(() => normalizeJournal({ ...request(), lines: [] })).toThrow();
    expect(() => normalizeJournal({ ...request(), userId: "owner" })).toThrow();
  });
  it("rejects mismatched identity and per-currency rates", () => {
    const r = request();
    r.lines[0].rateTry = "2";
    expect(() => normalizeJournal(r)).toThrow("INVALID_IDENTITY_RATE");
    r.lines[0].rateTry = "1";
    r.lines[0].rateUsd = "0.03";
    expect(() => normalizeJournal(r)).toThrow("INCONSISTENT_JOURNAL_RATES");
  });
  it("rejects converted overflow and original currency imbalance", () => {
    const r = request();
    r.lines.forEach((l) => (l.rateUsd = "1000000000000"));
    expect(() => normalizeJournal(r)).toThrow("AMOUNT_OVERFLOW");
    const b = request();
    b.lines[1].currency = "CAD";
    expect(() => normalizeJournal(b)).toThrow("UNBALANCED_JOURNAL");
  });
  it("never silently balances a fractional conversion difference", () => {
    const r = request();
    r.lines[0].debit = "0.003";
    r.lines[1].credit = "0.0015";
    r.lines.push({ ...r.lines[1], accountId: "other" });
    expect(() => normalizeJournal(r)).toThrow("UNBALANCED_JOURNAL");
  });
});
