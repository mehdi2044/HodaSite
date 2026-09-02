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
}
