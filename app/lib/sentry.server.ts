/** Sentry error tracking — opt-in via SENTRY_DSN env var.
 *  If not set, all functions are no-ops. */

let initialized = false;

async function ensureInit() {
  if (initialized || !process.env.SENTRY_DSN) return null;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? "development",
  });
  initialized = true;
  return Sentry;
}

export async function captureException(error: unknown): Promise<void> {
  const Sentry = await ensureInit();
  if (Sentry) Sentry.captureException(error);
}

export async function captureMessage(message: string, extra?: Record<string, unknown>): Promise<void> {
  const Sentry = await ensureInit();
  if (Sentry) {
    Sentry.withScope((scope) => {
      if (extra) scope.setExtras(extra);
      scope.setLevel("error");
      Sentry.captureMessage(message);
    });
  }
}
