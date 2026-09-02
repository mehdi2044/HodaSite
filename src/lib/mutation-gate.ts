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
 * Wrap the body of a mutating Server Action. Rejects with MaintenanceError
 * while maintenance mode is on, and keeps the in-flight counter accurate for
 * the restore drain step (A8).
 */
export async function withMutation<T>(fn: () => Promise<T>): Promise<T> {
  if (await isMaintenanceOn()) throw new MaintenanceError();
  enterRequest();
  try {
    return await fn();
  } finally {
    leaveRequest();
  }
}
