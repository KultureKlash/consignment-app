import { createHmac, timingSafeEqual } from "crypto";
import prisma from "~/db.server";
import { CONSIGNOR_STATUS } from "~/lib/order-statuses";

const COOKIE_NAME = "__portal_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;    // 7-day sliding window
/** @internal */ export const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;   // 24h without activity → force re-login
/** @internal */ export const ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000; // 30-day hard cap

const COOKIE_SECRET = process.env.COOKIE_SECRET || "dev-cookie-secret-change-in-prod";
if (process.env.NODE_ENV === "production" && !process.env.COOKIE_SECRET) {
  throw new Error("COOKIE_SECRET environment variable is required in production");
}

const isProd = process.env.NODE_ENV === "production";

// ── Cookie signing ──

/** @internal Exported for testing only */
export function sign(value: string): string {
  const signature = createHmac("sha256", COOKIE_SECRET).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", COOKIE_SECRET).update(value).digest("base64url");
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return value;
  } catch { /* length mismatch */ }
  return null;
}

// ── Session cookie format: "consignorId:issuedAt:lastActiveAt" ──

function parseSession(raw: string): { consignorId: string; issuedAt: number; lastActiveAt: number } | null {
  const parts = raw.split(":");
  if (parts.length === 1) {
    // Legacy format (just consignorId) — treat as fresh session
    return { consignorId: parts[0], issuedAt: Date.now(), lastActiveAt: Date.now() };
  }
  if (parts.length !== 3) return null;
  return { consignorId: parts[0], issuedAt: parseInt(parts[1]), lastActiveAt: parseInt(parts[2]) };
}

/**
 * Authenticate a portal request. Returns consignor + optional refresh cookie.
 * refreshCookie is set when the sliding window needs extending.
 */
export async function authenticatePortal(request: Request): Promise<
  (Awaited<ReturnType<typeof prisma.consignor.findUnique>> & { refreshCookie?: string }) | null
> {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const payload = unsign(decodeURIComponent(match[1]));
  if (!payload) return null;

  const session = parseSession(payload);
  if (!session) return null;

  const now = Date.now();

  // Absolute max — 30 days regardless of activity
  if (now - session.issuedAt > ABSOLUTE_MAX_MS) return null;

  // Idle timeout — 24h since last activity
  if (now - session.lastActiveAt > IDLE_TIMEOUT_MS) return null;

  const consignor = await prisma.consignor.findUnique({ where: { id: session.consignorId } });
  if (!consignor || consignor.status === CONSIGNOR_STATUS.SUSPENDED) return null;

  // Sliding window: refresh cookie if >1 hour since last active
  let refreshCookie: string | undefined;
  if (now - session.lastActiveAt > 60 * 60 * 1000) {
    refreshCookie = buildCookie(sign(`${session.consignorId}:${session.issuedAt}:${now}`));
  }

  return Object.assign(consignor, { refreshCookie });
}

/** Create a short-lived signed token for admin impersonation (expires in 30 seconds). */
export function createImpersonationToken(consignorId: string): string {
  return sign(`imp:${consignorId}:${Date.now()}`);
}

/** Verify an impersonation token. Returns consignorId or null if invalid/expired. */
export function verifyImpersonationToken(token: string): string | null {
  const payload = unsign(token);
  if (!payload || !payload.startsWith("imp:")) return null;
  const parts = payload.split(":");
  if (parts.length !== 3) return null;
  if (Date.now() - parseInt(parts[2], 10) > 30_000) return null;
  return parts[1];
}

/** Build a Set-Cookie header to create a signed portal session. */
export function createSessionCookie(consignorId: string): string {
  const now = Date.now();
  return buildCookie(sign(`${consignorId}:${now}:${now}`));
}

/** Build a Set-Cookie header to destroy a portal session. */
export function destroySessionCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    "Path=/portal",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    ...(isProd ? ["Secure"] : []),
  ].join("; ");
}

function buildCookie(signedValue: string): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(signedValue)}`,
    "Path=/portal",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${MAX_AGE_SEC}`,
    ...(isProd ? ["Secure"] : []),
  ].join("; ");
}
