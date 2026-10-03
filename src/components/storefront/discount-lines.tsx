import { Iso } from "./iso";
export function DiscountLines({
  lines,
  currency,
}: {
  lines: readonly { title: string; amount: string }[];
  currency: string;
}) {
  return lines.map((line, index) => (
    <div
      key={index}
      className="flex justify-between gap-3 text-success"
      data-testid="discount-line"
    >
      <dt className="min-w-0 break-words">{line.title}</dt>
      <dd className="shrink-0">
        <Iso>
          −{line.amount} {currency}
        </Iso>
      </dd>
    </div>
  ));
}
