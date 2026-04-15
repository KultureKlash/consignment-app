/** Validate required environment variables at startup.
 *  Throws immediately if critical vars are missing in production. */

const REQUIRED_ALWAYS = ["DATABASE_URL"];
const REQUIRED_PROD = ["COOKIE_SECRET", "RESEND_API_KEY"];

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
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
