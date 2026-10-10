import { describe, expect, it, vi } from "vitest";
vi.mock("@/modules/auth", () => ({ auth: async () => null }));
import { fittingSettings, grantFittingCoins } from "@/modules/fitting/settings";
import { UnauthorizedError } from "@/modules/access";
describe("fitting administration authentication boundary", () => {
  it("refuses anonymous reads and credit grants before database mutation", async () => {
    await expect(fittingSettings()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      grantFittingCoins({
        requestKey: "4d258ea3-7897-4b50-a4f6-bc7b0b14b570",
        customerIds: ["example"],
        amount: "100",
        expiresAt: null,
        reason: "fixture",
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
