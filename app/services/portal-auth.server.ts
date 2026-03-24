import prisma from "~/db.server";

const COOKIE_NAME = "__portal_session";
const DEV_PASSWORD = "konsign";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Authenticate a portal request by reading the session cookie.
 * Returns the consignor or null.
 */
export async function authenticatePortal(request: Request) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const consignorId = match[1];
  const consignor = await prisma.consignor.findUnique({
    where: { id: consignorId },
  });
  return consignor;
}

/**
 * Validate login credentials (dev: password is "konsign" for all consignors).
 * Returns { consignor } on success or { error } on failure.
 */
export async function loginPortal(email: string, password: string) {
  if (!email) return { error: "Please enter your email address." };
  if (!password) return { error: "Please enter your password." };

  // Dev auth — TODO: replace with magic link for production
  if (password !== DEV_PASSWORD) {
    return { error: "Invalid email or password." };
  }

  const consignor = await prisma.consignor.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!consignor) {
    return { error: "Invalid email or password." };
  }

  return { consignor };
}

/** Build a Set-Cookie header to create a portal session. */
export function createSessionCookie(consignorId: string): string {
  return `${COOKIE_NAME}=${consignorId}; Path=/portal; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/** Build a Set-Cookie header to destroy a portal session. */
export function destroySessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/portal; HttpOnly; SameSite=Lax; Max-Age=0`;
}
