import { captureException, captureMessage } from "./sentry.server";

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = { level, message, ts: new Date().toISOString(), ...meta };
  if (level === "error") {
    console.error(JSON.stringify(entry));
    // Send errors to Sentry so they're visible in the dashboard
    captureMessage(message, meta);
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
