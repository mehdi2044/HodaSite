import { isMaintenanceOn } from "@/modules/settings";
import { enterRequest, leaveRequest } from "@/lib/request-metrics";

/** Thrown by a Server Action when the site is in maintenance mode. */
export class MaintenanceError extends Error {
  constructor() {
    super("MAINTENANCE");
    this.name = "MaintenanceError";
  }
}

/**
 * Wrap the body of a mutating Server Action.
 *
 * Order matters (A8, Vee): the in-flight counter is incremented BEFORE the
 * maintenance check and decremented in `finally`. If the check came first, the
 * `await` between "maintenance is off" and `enterRequest()` would let a restore
 * observe `inFlight: 0` and start while this mutation is about to write. With
 * this order the mutation is already counted before it yields, so the restore
 * drain can never miss it; and once maintenance is on, `isMaintenanceOn()`
 * returns true synchronously from the in-process flag, so nothing new runs.
 */
export async function withMutation<T>(fn: () => Promise<T>): Promise<T> {
  enterRequest();
  try {
    if (await isMaintenanceOn()) throw new MaintenanceError();
    return await fn();
  } finally {
    leaveRequest();
  }
}
