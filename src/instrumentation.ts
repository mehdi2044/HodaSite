/**
 * Fail loudly at server startup if a required secret is missing, rather than
 * silently falling back to an insecure default. Runs once per runtime.
 */
export async function register() {
  const required = ["AUTH_SECRET", "DATABASE_URL"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `See .env.example.`,
    );
  }

  // Job handlers self-register on import (D21 — DB-backed queue, no
  // Redis/BullMQ). Only wire this up in the actual Node runtime: sharp has a
  // native binary and must never load into the Edge runtime bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerMediaJobHandlers } =
      await import("@/modules/media/optimize");
    const { registerMediaPurgeHandler } = await import("@/modules/media/purge");
    registerMediaJobHandlers();
    await registerMediaPurgeHandler();
  }
}
