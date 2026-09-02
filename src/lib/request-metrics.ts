/**
 * In-flight mutation counter (fix-order A8).
 *
 * PER-INSTANCE. This counts mutations handled by *this* Node process only and
 * assumes the app runs as a single container (D22 / Phase 00 compose). If the
 * app is ever scaled to multiple replicas this must move to a shared store.
 *
 * Next.js middleware cannot observe when a downstream response finishes, so the
 * counter is incremented/decremented in the app layer — around the actual
 * mutation work in Server Actions and mutating Route Handlers — not in
 * middleware. `restore.sh` polls GET /api/system/maintenance until it reads
 * `inFlight: 0` before touching the database.
 */
let inFlight = 0;

export function enterRequest(): void {
  inFlight += 1;
}

export function leaveRequest(): void {
  inFlight = Math.max(0, inFlight - 1);
}

export function inFlightCount(): number {
  return inFlight;
}
