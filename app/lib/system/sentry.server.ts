/** Sentry error tracking — opt-in via SENTRY_DSN env var.
 *  If not set, every function is a no-op. */

type SentryModule = typeof import("@sentry/node");

/**
 * Cached module promise, not a boolean.
 *
 * This used to be `let initialized = false` with `if (initialized) return null`,
 * which meant the SECOND error onward got a null module and was silently
 * dropped: Sentry reported at most one event per process lifetime. Caching the
 * promise keeps init single-shot while still handing back a usable client.
 */
let sentryPromise: Promise<SentryModule> | null = null;

function ensureInit(): Promise<SentryModule> | null {
  if (!process.env.SENTRY_DSN) return null;
  if (!sentryPromise) {
    sentryPromise = import("@sentry/node").then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV ?? "development",
      });
      return Sentry;
    });
  }
  return sentryPromise;
}

/** Values that identify where an error happened; searchable in Sentry. */
export type SentryTags = Record<string, string | number | undefined | null>;

export type CaptureOptions = {
  /** Promoted to Sentry tags — filterable and usable in alert rules. */
  tags?: SentryTags;
  /** Everything else; visible on the event but not searchable. */
  extras?: Record<string, unknown>;
  /** Overrides the issue title when the error message is too generic. */
  message?: string;
};

function applyScope(
  scope: { setTag: (k: string, v: string) => void; setExtras: (e: Record<string, unknown>) => void; setLevel: (l: "error") => void },
  opts?: CaptureOptions,
) {
  scope.setLevel("error");
  for (const [key, value] of Object.entries(opts?.tags ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    scope.setTag(key, String(value));
  }
  if (opts?.extras && Object.keys(opts.extras).length > 0) scope.setExtras(opts.extras);
}

/**
 * Report a real error, preserving its stack.
 *
 * Prefer this over captureMessage for anything thrown: captureMessage groups by
 * message text, so a constant string collapses every unrelated failure into one
 * Sentry issue and carries no stack.
 */
export async function captureException(error: unknown, opts?: CaptureOptions): Promise<void> {
  const pending = ensureInit();
  if (!pending) return;
  try {
    const Sentry = await pending;
    Sentry.withScope((scope) => {
      applyScope(scope, opts);
      if (opts?.message) scope.setExtra("logMessage", opts.message);
      Sentry.captureException(error);
    });
  } catch {
    // Never let telemetry break the request it is reporting on.
  }
}

/** For conditions with no Error object. Anything thrown should use captureException. */
export async function captureMessage(message: string, extra?: Record<string, unknown>): Promise<void> {
  const pending = ensureInit();
  if (!pending) return;
  try {
    const Sentry = await pending;
    Sentry.withScope((scope) => {
      applyScope(scope, { extras: extra });
      Sentry.captureMessage(message);
    });
  } catch {
    // Never let telemetry break the request it is reporting on.
  }
}

/**
 * Wait for queued events to reach Sentry.
 *
 * Capture is fire-and-forget, so a handler that returns immediately after
 * logging can have its response flushed and the request torn down before the
 * event is sent. Await this on paths that are about to return — the webhook
 * error path in particular, where a dropped event means an invisible retry.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  const pending = ensureInit();
  if (!pending) return;
  try {
    const Sentry = await pending;
    await Sentry.flush(timeoutMs);
  } catch {
    // Flush failures are not worth surfacing.
  }
}
