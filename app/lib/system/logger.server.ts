import { captureException, captureMessage, type SentryTags } from "./sentry.server";

type LogLevel = "info" | "warn" | "error";

export type LogMeta = Record<string, unknown> & {
  /**
   * Pass the Error itself, not `err.message`. The logger serializes it for the
   * console line and hands the original to Sentry so the stack survives.
   */
  error?: unknown;
};

/**
 * Keys promoted from meta to Sentry tags, which are searchable and usable in
 * alert rules. Everything else becomes a non-searchable extra.
 */
const TAG_KEYS = ["topic", "shop", "shopifyEventId", "orderId", "consignorId"] as const;

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

function splitMeta(meta?: LogMeta): { tags: SentryTags; extras: Record<string, unknown> } {
  const tags: SentryTags = {};
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta ?? {})) {
    if (key === "error") continue;
    if ((TAG_KEYS as readonly string[]).includes(key)) {
      tags[key] = value as string | number | undefined | null;
    } else {
      extras[key] = value;
    }
  }
  return { tags, extras };
}

/**
 * Returns a promise on the error path so callers that are about to return a
 * response can await delivery. Info and warn resolve immediately. It never
 * rejects — telemetry must not break the request it is reporting on.
 */
function log(level: LogLevel, message: string, meta?: LogMeta): Promise<void> {
  const entry: Record<string, unknown> = { level, message, ts: new Date().toISOString(), ...meta };
  if (meta && "error" in meta) entry.error = serializeError(meta.error);

  if (level !== "error") {
    console.log(JSON.stringify(entry));
    return Promise.resolve();
  }

  console.error(JSON.stringify(entry));

  const { tags, extras } = splitMeta(meta);
  const error = meta?.error;

  // An Error goes to captureException so Sentry gets the stack and groups by it.
  // captureMessage groups by message text, which collapsed every unrelated
  // failure sharing a log line into one issue — only use it when there is no
  // Error to report.
  return error === undefined
    ? captureMessage(message, { ...tags, ...extras })
    : captureException(error, { tags, extras, message });
}

export const logger = {
  info: (msg: string, meta?: LogMeta) => void log("info", msg, meta),
  warn: (msg: string, meta?: LogMeta) => void log("warn", msg, meta),
  /** Awaitable: `await logger.error(...)` before returning a response. */
  error: (msg: string, meta?: LogMeta) => log("error", msg, meta),
};
