import { Exact } from "./operations-input";
export type ProfitRow = {
  marketId: string;
  code: string;
  kind: string;
  amountTry: string;
  amountUsd: string;
};
export function profitTotals(rows: ProfitRow[]) {
  const result = {
    revenueTry: new Exact(0),
    revenueUsd: new Exact(0),
    costTry: new Exact(0),
    costUsd: new Exact(0),
    expenseTry: new Exact(0),
    expenseUsd: new Exact(0),
  };
  for (const r of rows) {
    if (r.kind === "INCOME") {
      result.revenueTry = result.revenueTry.sub(r.amountTry);
      result.revenueUsd = result.revenueUsd.sub(r.amountUsd);
    }
    if (r.code === "cogs") {
      result.costTry = result.costTry.add(r.amountTry);
      result.costUsd = result.costUsd.add(r.amountUsd);
    } else if (r.kind === "EXPENSE") {
      result.expenseTry = result.expenseTry.add(r.amountTry);
      result.expenseUsd = result.expenseUsd.add(r.amountUsd);
    }
  }
  return {
    ...Object.fromEntries(
      Object.entries(result).map(([k, v]) => [k, v.toFixed(4)]),
    ),
    grossTry: result.revenueTry.sub(result.costTry).toFixed(4),
    grossUsd: result.revenueUsd.sub(result.costUsd).toFixed(4),
    profitTry: result.revenueTry
      .sub(result.costTry)
      .sub(result.expenseTry)
      .toFixed(4),
    profitUsd: result.revenueUsd
      .sub(result.costUsd)
      .sub(result.expenseUsd)
      .toFixed(4),
  };
}
