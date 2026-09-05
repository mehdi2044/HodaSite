import { describe, it, expect } from "vitest";
import { isMaintenanceEffective } from "@/modules/settings";

const NOW = new Date("2026-09-05T12:00:00Z");

describe("isMaintenanceEffective", () => {
  it("off is never effective", () => {
    expect(isMaintenanceEffective({ state: "off" }, NOW)).toBe(false);
  });

  it("on is always effective", () => {
    expect(isMaintenanceEffective({ state: "on" }, NOW)).toBe(true);
  });

  it("scheduled with no window is effective immediately", () => {
    expect(isMaintenanceEffective({ state: "scheduled" }, NOW)).toBe(true);
  });

  it("scheduled respects startsAt/endsAt", () => {
    const cfg = {
      state: "scheduled" as const,
      startsAt: "2026-09-05T13:00:00Z",
      endsAt: "2026-09-05T15:00:00Z",
    };
    expect(isMaintenanceEffective(cfg, new Date("2026-09-05T12:00:00Z"))).toBe(
      false,
    );
    expect(isMaintenanceEffective(cfg, new Date("2026-09-05T14:00:00Z"))).toBe(
      true,
    );
    expect(isMaintenanceEffective(cfg, new Date("2026-09-05T16:00:00Z"))).toBe(
      false,
    );
  });
});
