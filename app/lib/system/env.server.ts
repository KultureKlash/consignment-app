/** Validate required environment variables at startup.
 *  Throws immediately if critical vars are missing in production. */

const REQUIRED_ALWAYS = ["DATABASE_URL"];
// CRON_SECRET gates /cron/retention, which is what actually erases customer PII
// past the 90-day window. Without it that route 404s and the data is simply kept,
// so this fails the boot rather than letting retention silently not happen.
const REQUIRED_PROD = ["COOKIE_SECRET", "RESEND_API_KEY", "CRON_SECRET"];
/** Not required — the app runs without error reporting — but worth saying so. */
const RECOMMENDED_PROD = ["SENTRY_DSN"];

export function validateEnv() {
  const missing: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  for (const key of REQUIRED_ALWAYS) {
    if (!process.env[key]) missing.push(key);
  }

  if (isProd) {
    for (const key of REQUIRED_PROD) {
      if (!process.env[key]) missing.push(key);
    }

    if (process.env.COOKIE_SECRET === "dev-cookie-secret-change-in-prod") {
      throw new Error("COOKIE_SECRET is still set to the dev default — change it before deploying to production");
    }

    for (const key of RECOMMENDED_PROD) {
      if (!process.env[key]) {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: `${key} is not set — running without it`,
            ts: new Date().toISOString(),
          }),
        );
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
