import { describe, expect, it } from "vitest";
import {
  FITTING_FLIGHT_MS,
  fittingDeparture,
  fittingPhase,
  fittingTiming,
} from "@/components/storefront/fitting-ad-timeline";
describe("D77 fitting ad timeline", () => {
  it("keeps the 3-garment D77 timing and never scans before the last piece lands", () => {
    expect([0, 1, 2].map(fittingDeparture)).toEqual([700, 1950, 3200]);
    expect(fittingTiming(3)).toEqual({ scan: 5050, reveal: 6150, end: 9750 });
    for (const count of [2, 3, 4]) {
      const { scan, reveal, end } = fittingTiming(count);
      expect(scan).toBeGreaterThan(
        fittingDeparture(count - 1) + FITTING_FLIGHT_MS,
      );
      expect(fittingPhase(0, count).phase).toBe("pick");
      expect(fittingPhase(700, count).phase).toBe("dress");
      expect(fittingPhase(scan, count).phase).toBe("style");
      expect(fittingPhase(reveal, count).phase).toBe("look");
      expect(fittingPhase(end, count).phase).toBe("look");
    }
  });
});
