import { describe, it, expect, beforeEach, vi } from "vitest";
import { withMutation, MaintenanceError } from "@/lib/mutation-gate";
import { inFlightCount } from "@/lib/request-metrics";
import { setMaintenanceFlag } from "@/modules/settings";

// Force the in-process maintenance flag so isMaintenanceOn() never touches the
// database. Start every test with maintenance off and the counter at rest.
beforeEach(() => {
  setMaintenanceFlag(false);
  expect(inFlightCount()).toBe(0);
});

describe("withMutation maintenance gate (A8 — TOCTOU boundary)", () => {
  it("keeps inFlight >= 1 while a mutation is in its body, and rejects mutations that start after maintenance flips on", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });

    // A mutation whose body is parked on a promise we control.
    const running = withMutation(async () => {
      await blocker;
      return "committed";
    });

    // Wait until withMutation has entered the counter and is inside fn().
    await vi.waitFor(() => expect(inFlightCount()).toBe(1));

    // Restore flips maintenance on while that mutation is still running.
    setMaintenanceFlag(true);

    // The endpoint would report inFlight: 1 here — never 0 — so a restore
    // drain cannot start.
    expect(inFlightCount()).toBe(1);

    // A mutation that STARTS after the flip is rejected...
    await expect(
      withMutation(async () => "should not run"),
    ).rejects.toBeInstanceOf(MaintenanceError);
    // ...and its finally path left the counter untouched (still just the
    // blocked mutation).
    expect(inFlightCount()).toBe(1);

    // Release the in-flight mutation: it completes and the counter drains.
    release();
    await expect(running).resolves.toBe("committed");
    expect(inFlightCount()).toBe(0);
  });

  it("decrements the counter when fn() throws", async () => {
    await expect(
      withMutation(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(inFlightCount()).toBe(0);
  });
});
