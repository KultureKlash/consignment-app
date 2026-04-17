import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import {
  authenticatePortal,
  sign,
  IDLE_TIMEOUT_MS,
  ABSOLUTE_MAX_MS,
} from "~/services/portal/auth.server";

// ── Helper: build a cookie with custom timestamps ──

function buildTimestampedCookie(consignorId: string, issuedAt: number, lastActiveAt: number): string {
  const signed = sign(`${consignorId}:${issuedAt}:${lastActiveAt}`);
  return `__portal_session=${encodeURIComponent(signed)}`;
}

function requestWithCookie(cookie: string): Request {
  return new Request("http://localhost/portal/listings", {
    headers: { Cookie: cookie },
  });
}

// ═══════════════════════════════════════════════════════════
// Session timeout tests
// ═══════════════════════════════════════════════════════════

describe("Session timeouts", () => {
  it("accepts a fresh session (just created)", async () => {
    const c = await createTestConsignor({ email: "fresh@test.com" });
    const now = Date.now();
    const cookie = buildTimestampedCookie(c.id, now, now);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).not.toBeNull();
    expect(result!.id).toBe(c.id);
  });

  it("accepts session active 23 hours ago (within idle timeout)", async () => {
    const c = await createTestConsignor({ email: "recent@test.com" });
    const now = Date.now();
    const cookie = buildTimestampedCookie(c.id, now - 2 * 60 * 60 * 1000, now - 23 * 60 * 60 * 1000);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).not.toBeNull();
  });

  it("rejects session idle for over 24 hours", async () => {
    const c = await createTestConsignor({ email: "idle@test.com" });
    const now = Date.now();
    const cookie = buildTimestampedCookie(c.id, now - 48 * 60 * 60 * 1000, now - IDLE_TIMEOUT_MS - 1000);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).toBeNull();
  });

  it("rejects session older than 30 days (absolute max)", async () => {
    const c = await createTestConsignor({ email: "old@test.com" });
    const now = Date.now();
    // Issued 31 days ago, but last active just now (still should be rejected)
    const cookie = buildTimestampedCookie(c.id, now - ABSOLUTE_MAX_MS - 1000, now);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).toBeNull();
  });

  it("accepts session at exactly 29 days old", async () => {
    const c = await createTestConsignor({ email: "almost30@test.com" });
    const now = Date.now();
    const cookie = buildTimestampedCookie(c.id, now - 29 * 24 * 60 * 60 * 1000, now - 1000);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).not.toBeNull();
  });
});

describe("Sliding window refresh", () => {
  it("does not set refreshCookie when last active < 1 hour ago", async () => {
    const c = await createTestConsignor({ email: "noslide@test.com" });
    const now = Date.now();
    const cookie = buildTimestampedCookie(c.id, now, now - 30 * 60 * 1000); // 30 min ago
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).not.toBeNull();
    expect(result!.refreshCookie).toBeUndefined();
  });

  it("sets refreshCookie when last active > 1 hour ago", async () => {
    const c = await createTestConsignor({ email: "slide@test.com" });
    const now = Date.now();
    const cookie = buildTimestampedCookie(c.id, now - 5 * 60 * 60 * 1000, now - 2 * 60 * 60 * 1000); // 2 hours ago
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).not.toBeNull();
    expect(result!.refreshCookie).toBeDefined();
    expect(result!.refreshCookie).toContain("__portal_session=");
  });

  it("refreshCookie preserves original issuedAt (doesn't reset absolute clock)", async () => {
    const c = await createTestConsignor({ email: "preserve@test.com" });
    const now = Date.now();
    const issuedAt = now - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    const cookie = buildTimestampedCookie(c.id, issuedAt, now - 2 * 60 * 60 * 1000);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).not.toBeNull();
    expect(result!.refreshCookie).toBeDefined();
    // The refresh cookie should contain the original issuedAt
    const decoded = decodeURIComponent(result!.refreshCookie!.split("=")[1].split(";")[0]);
    // Strip signature, check payload
    const payload = decoded.substring(0, decoded.lastIndexOf("."));
    const parts = payload.split(":");
    expect(parts[1]).toBe(String(issuedAt));
  });
});
