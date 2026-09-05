/**
 * Fail loudly at server startup if a required secret is missing, rather than
 * silently falling back to an insecure default. Runs once per runtime.
 *
 * Media job handler registration (registerMediaJobHandlers/
 * registerMediaPurgeHandler) deliberately does NOT live here: instrumentation
 * code is compiled through a separate webpack pass that does not honor
 * next.config.ts's `serverExternalPackages`, so importing `sharp` (even
 * transitively, via src/modules/media/optimize.ts) from this file crashes at
 * boot trying to statically resolve sharp's platform-conditional requires
 * (confirmed against the real Docker image). It's registered instead from
 * src/app/api/cron/tick/route.ts, a normal Route Handler that does respect
 * serverExternalPackages.
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
}
