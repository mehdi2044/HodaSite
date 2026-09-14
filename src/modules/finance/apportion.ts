import { Exact } from "./operations-input";
/** Largest remainder with stable ID ties; every allocation sums to its source. */
export function apportion(
  value: string,
  weights: { id: string; weight: string }[],
) {
  if (
    !weights.length ||
    new Set(weights.map((w) => w.id)).size !== weights.length ||
    weights.some(
      (w) => !new Exact(w.weight).isFinite() || new Exact(w.weight).lt(0),
    )
  )
    throw new Error("ALLOCATION_INPUT");
  const total = weights.reduce((n, w) => n.add(w.weight), new Exact(0));
  const amount = new Exact(value);
  const sign = amount.isNegative() ? -1 : 1;
  if (!amount.isFinite() || !amount.eq(amount.toDecimalPlaces(4)))
    throw new Error("ALLOCATION_INPUT");
  const rows = weights.map((w) => {
    const exact = amount
      .abs()
      .mul(total.isZero() ? 1 : w.weight)
      .div(total.isZero() ? weights.length : total);
    const rounded = exact.toDecimalPlaces(4, Exact.ROUND_DOWN);
    return { id: w.id, rounded, remainder: exact.sub(rounded) };
  });
  let left = amount
    .abs()
    .sub(rows.reduce((n, r) => n.add(r.rounded), new Exact(0)));
  for (const row of [...rows].sort(
    (a, b) => b.remainder.cmp(a.remainder) || (a.id < b.id ? -1 : 1),
  )) {
    if (left.isZero()) break;
    row.rounded = row.rounded.add("0.0001");
    left = left.sub("0.0001");
  }
  if (!left.isZero()) throw new Error("ALLOCATION_PRECISION");
  return Object.fromEntries(
    rows.map((r) => [r.id, r.rounded.mul(sign).toFixed(4)]),
  );
}
