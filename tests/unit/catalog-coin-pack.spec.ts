import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/modules/catalog/validation";

describe("catalog coin-pack classification input", () => {
  it.each([undefined, "", "100", "12.5001", "999999999999.9999"])(
    "accepts an ordinary product or valid pack amount %s",
    (value) => {
      expect(
        productInputSchema.shape.coinPackCoins.safeParse(value).success,
      ).toBe(true);
    },
  );

  it.each([
    "0",
    "0.0000",
    "-1",
    "invalid",
    "1.2.3",
    "1000000000000",
    "1.00001",
  ])("rejects invalid pack amount %s without throwing", (value) => {
    expect(
      productInputSchema.shape.coinPackCoins.safeParse(value).success,
    ).toBe(false);
  });
});
