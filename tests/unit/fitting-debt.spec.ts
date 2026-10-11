import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  grantCoinsBatch,
  payCoinDebt,
  settleDebt,
  walletDebt,
  coinBalance,
} from "@/modules/fitting/ledger";

function fixture(base: string, balances: string[], grants: string[] = []) {
  const Exact = Decimal.clone({ precision: 100 });
  const wallet = { debt: base };
  const lots = balances.map((balance, i) => ({
    id: `debt-${i}`,
    amount: balance,
    balance,
  }));
  const credits = grants.map((balance, i) => ({ id: `grant-${i}`, balance }));
  const mock = {
    $executeRaw: vi.fn(async (query: Prisma.Sql) => {
      for (let i = 0; i < query.values.length; i += 2) {
        if (query.sql.includes('UPDATE "FittingWallet"'))
          wallet.debt = String(query.values[i + 1]);
        else
          lots.find((l) => l.id === query.values[i])!.balance = String(
            query.values[i + 1],
          );
      }
      return query.values.length / 2;
    }),
    fittingWallet: {
      findUniqueOrThrow: vi.fn(async () => wallet),
      update: vi.fn(
        async (input: { data: { debt: { decrement: string } } }) => {
          wallet.debt = new Exact(wallet.debt)
            .sub(input.data.debt.decrement)
            .toFixed();
          return wallet;
        },
      ),
    },
    fittingCoinDebtOverflow: {
      aggregate: vi.fn(async () => ({
        _sum: {
          balance: lots
            .reduce((n, l) => n.add(l.balance), new Exact(0))
            .toFixed(),
        },
      })),
      findMany: vi.fn(async () =>
        lots.filter((l) => new Exact(l.balance).gt(0)),
      ),
      update: vi.fn(
        async (input: {
          where: { id: string };
          data: { balance: { decrement: string } };
        }) => {
          const lot = lots.find((l) => l.id === input.where.id)!;
          lot.balance = new Exact(lot.balance)
            .sub(input.data.balance.decrement)
            .toFixed();
          return lot;
        },
      ),
    },
    fittingCoinGrant: {
      findMany: vi.fn(async () => credits),
      update: vi.fn(
        async (input: {
          where: { id: string };
          data: { balance: { decrement: string } };
        }) => {
          const grant = credits.find((g) => g.id === input.where.id)!;
          grant.balance = new Exact(grant.balance)
            .sub(input.data.balance.decrement)
            .toFixed();
          return grant;
        },
      ),
    },
  };
  return {
    tx: mock as unknown as Prisma.TransactionClient,
    mock,
    wallet,
    lots,
    credits,
  };
}

describe("fitting debt across bounded liability tranches", () => {
  it.each([101, 1000])(
    "sums %i maximum spendable lots without losing four decimals",
    (count) => {
      const grants = Array.from({ length: count }, () => ({
        balance: "99999999999999.9999",
      }));
      const Exact = Decimal.clone({ precision: 100 });
      const expected = new Exact(grants[0].balance).mul(count).toFixed();
      expect(coinBalance(grants).toFixed()).toBe(expected);
      expect(
        coinBalance([...grants, { balance: "0.0001" }].reverse()).toFixed(),
      ).toBe(new Exact(expected).add("0.0001").toFixed());
      expect(coinBalance([]).toFixed()).toBe("0");
    },
  );
  it("uses a bounded set of statements for 1000 recipients and skips an existing source", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `customer-${i}`);
    const mock = {
      fittingWallet: { createMany: vi.fn(async () => ({ count: 1000 })) },
      $queryRaw: vi.fn(async () =>
        ids.map((customerId) => ({ customerId, debt: "0" })),
      ),
      $executeRaw: vi.fn(),
      fittingCoinDebtOverflow: { findMany: vi.fn(async () => []) },
      fittingCoinGrant: {
        findMany: vi.fn(async () => [{ customerId: ids[0] }]),
        createMany: vi.fn(async () => ({ count: 999 })),
      },
      fittingCoinEntry: { createMany: vi.fn(async () => ({ count: 999 })) },
    };
    await grantCoinsBatch(
      mock as unknown as Prisma.TransactionClient,
      ids,
      "manual:fixture",
      "MANUAL",
      "12.5001",
    );
    expect(mock.fittingWallet.createMany).toHaveBeenCalledTimes(1);
    expect(mock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mock.fittingCoinGrant.findMany).toHaveBeenCalledTimes(1);
    expect(mock.fittingCoinDebtOverflow.findMany).toHaveBeenCalledTimes(1);
    expect(mock.$executeRaw).not.toHaveBeenCalled();
    expect(mock.fittingCoinGrant.createMany).toHaveBeenCalledExactlyOnceWith({
      data: ids.slice(1).map((customerId) => ({
        customerId,
        sourceKey: "manual:fixture",
        reason: "MANUAL",
        amount: "12.5001",
        balance: "12.5001",
      })),
    });
    expect(mock.fittingCoinEntry.createMany).toHaveBeenCalledExactlyOnceWith({
      data: ids.slice(1).map((customerId) => ({
        customerId,
        sourceKey: "grant:manual:fixture",
        reason: "MANUAL",
        amount: "12.5001",
      })),
    });
  });
  it("reports the complete sum without losing four-decimal precision above 20 digits", async () => {
    const f = fixture("99999999999999.9999", []);
    f.mock.fittingCoinDebtOverflow.aggregate.mockResolvedValueOnce({
      _sum: { balance: "10000000000000000000000.0002" },
    });
    expect((await walletDebt(f.tx, "customer")).toFixed()).toBe(
      "10000000100000000000000.0001",
    );
  });
  it("repays the first tranche and several overflow lots with exact partial remainders", async () => {
    const f = fixture("12.5", ["1.0001", "2.5"]);
    expect((await payCoinDebt(f.tx, "customer", "13.5002")).toFixed()).toBe(
      "13.5002",
    );
    expect(f.wallet.debt).toBe("0");
    expect(f.lots.map((l) => l.balance)).toEqual(["0", "2.4999"]);
    expect(f.lots.map((l) => l.amount)).toEqual(["1.0001", "2.5"]);
    expect((await walletDebt(f.tx, "customer")).toFixed()).toBe("2.4999");
  });
  it("settles multiple spendable grants without storing their combined payment in one numeric row", async () => {
    const maximum = "99999999999999.9999";
    const f = fixture("0", [maximum, maximum], [maximum, "12.5"]);
    await settleDebt(f.tx, "customer");
    expect(f.credits.map((g) => g.balance)).toEqual(["0", "0"]);
    expect(f.lots.map((l) => l.balance)).toEqual(["0", "99999999999987.4999"]);
    expect(f.lots.map((l) => l.amount)).toEqual([maximum, maximum]);
    expect((await walletDebt(f.tx, "customer")).toFixed()).toBe(
      "99999999999987.4999",
    );
  });
});
