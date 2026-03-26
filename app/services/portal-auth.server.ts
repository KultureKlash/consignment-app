import { createHmac, timingSafeEqual } from "crypto";
import prisma from "~/db.server";

const COOKIE_NAME = "__portal_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Cookie signing secret — MUST be set in production
const COOKIE_SECRET = process.env.COOKIE_SECRET || "dev-cookie-secret-change-in-prod";
if (process.env.NODE_ENV === "production" && !process.env.COOKIE_SECRET) {
  throw new Error("COOKIE_SECRET environment variable is required in production");
}

const isProd = process.env.NODE_ENV === "production";

// ── Cookie signing ──

function sign(value: string): string {
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
  } catch {
    // Length mismatch — invalid signature
  }
  return null;
}

/**
 * Authenticate a portal request by reading the signed session cookie.
 * Returns the consignor or null.
 */
export async function authenticatePortal(request: Request) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const consignorId = unsign(decodeURIComponent(match[1]));
  if (!consignorId) return null;

  const consignor = await prisma.consignor.findUnique({
    where: { id: consignorId },
  });
  if (!consignor) return null;

  // Suspended accounts cannot access the portal
  if (consignor.status === "suspended") return null;

  return consignor;
}

/** Build a Set-Cookie header to create a signed portal session. */
export function createSessionCookie(consignorId: string): string {
  const signedValue = sign(consignorId);
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(signedValue)}`,
    "Path=/portal",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${MAX_AGE}`,
    ...(isProd ? ["Secure"] : []),
  ];
  return flags.join("; ");
}

/** Build a Set-Cookie header to destroy a portal session. */
export function destroySessionCookie(): string {
  const flags = [
    `${COOKIE_NAME}=`,
    "Path=/portal",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    ...(isProd ? ["Secure"] : []),
  ];
  return flags.join("; ");
}
