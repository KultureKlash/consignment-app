import { describe, it, expect, beforeEach } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import {
  authenticatePortal,
  createSessionCookie,
} from "~/services/portal-auth.server";
import { requestOtp, verifyOtp } from "~/services/otp.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import {
  requestOtpSchema,
  verifyOtpSchema,
  createConsignorSchema,
  submitListingSchema,
  portalEditListingSchema,
  updateProfileSchema,
  parseForm,
} from "~/lib/validation";

// ── Helper: build a Request with a cookie ──

function requestWithCookie(cookie: string): Request {
  return new Request("http://localhost/portal/listings", {
    headers: { Cookie: cookie },
  });
}

function formDataFrom(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

// ═══════════════════════════════════════════════════════════
// 1. COOKIE SIGNING — can't forge a session
// ═══════════════════════════════════════════════════════════

describe("Cookie signing & session forgery", () => {
  it("valid signed cookie authenticates correctly", async () => {
    const c = await createTestConsignor({ email: "legit@test.com" });
    const cookie = createSessionCookie(c.id);
    const req = requestWithCookie(cookie);
    const result = await authenticatePortal(req);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(c.id);
  });

  it("ATTACK: raw consignor ID (unsigned) is rejected", async () => {
    const c = await createTestConsignor({ email: "victim@test.com" });
    const req = requestWithCookie(`__portal_session=${c.id}`);
    const result = await authenticatePortal(req);
    expect(result).toBeNull();
  });

  it("ATTACK: forged signature is rejected", async () => {
    const c = await createTestConsignor({ email: "victim2@test.com" });
    const req = requestWithCookie(`__portal_session=${c.id}.fakesignature123`);
    const result = await authenticatePortal(req);
    expect(result).toBeNull();
  });

  it("ATTACK: tampered consignor ID (swapped) is rejected", async () => {
    const c1 = await createTestConsignor({ email: "user1@test.com" });
    const c2 = await createTestConsignor({ email: "user2@test.com" });
    const cookie = createSessionCookie(c1.id);
    const signedValue = decodeURIComponent(cookie.split("=")[1].split(";")[0]);
    const signature = signedValue.split(".").pop();
    const tampered = `__portal_session=${encodeURIComponent(`${c2.id}.${signature}`)}`;
    const result = await authenticatePortal(requestWithCookie(tampered));
    expect(result).toBeNull();
  });

  it("ATTACK: empty cookie value returns null", async () => {
    const result = await authenticatePortal(requestWithCookie("__portal_session="));
    expect(result).toBeNull();
  });

  it("ATTACK: garbage cookie value returns null", async () => {
    const result = await authenticatePortal(
      requestWithCookie("__portal_session=aaa.bbb.ccc.ddd")
    );
    expect(result).toBeNull();
  });

  it("suspended consignor with valid cookie is rejected", async () => {
    const c = await createTestConsignor({ email: "suspended@test.com", status: "suspended" });
    const cookie = createSessionCookie(c.id);
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).toBeNull();
  });

  it("deleted consignor with valid cookie is rejected", async () => {
    const c = await createTestConsignor({ email: "deleted@test.com" });
    const cookie = createSessionCookie(c.id);
    await prisma.consignor.delete({ where: { id: c.id } });
    const result = await authenticatePortal(requestWithCookie(cookie));
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// 2. OTP LOGIN FLOW
// ═══════════════════════════════════════════════════════════

describe("OTP login flow", () => {
  beforeEach(async () => {
    await prisma.otpCode.deleteMany();
  });

  it("requestOtp sends code for valid consignor", async () => {
    await createTestConsignor({ email: "user@test.com" });
    const result = await requestOtp("user@test.com");
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // OTP should be in database
    const otp = await prisma.otpCode.findFirst({ where: { email: "user@test.com" } });
    expect(otp).not.toBeNull();
    expect(otp!.code).toHaveLength(6);
    expect(otp!.usedAt).toBeNull();
  });

  it("requestOtp returns fake success for non-existent email (no enumeration)", async () => {
    const result = await requestOtp("nobody@test.com");
    expect(result.success).toBe(true); // Looks successful to attacker
    // But no OTP in database
    const otp = await prisma.otpCode.findFirst({ where: { email: "nobody@test.com" } });
    expect(otp).toBeNull();
  });

  it("requestOtp returns error for suspended account", async () => {
    await createTestConsignor({ email: "banned@test.com", status: "suspended" });
    const result = await requestOtp("banned@test.com");
    expect(result.error).toContain("suspended");
  });

  it("requestOtp deletes old OTPs before creating new one", async () => {
    await createTestConsignor({ email: "multi@test.com" });
    await requestOtp("multi@test.com");
    await requestOtp("multi@test.com");
    const count = await prisma.otpCode.count({ where: { email: "multi@test.com" } });
    expect(count).toBe(1); // Only latest OTP exists
  });

  it("verifyOtp succeeds with correct code", async () => {
    const c = await createTestConsignor({ email: "verify@test.com" });
    await requestOtp("verify@test.com");
    const otp = await prisma.otpCode.findFirst({ where: { email: "verify@test.com" } });

    const result = await verifyOtp("verify@test.com", otp!.code);
    expect(result).toHaveProperty("consignor");
    expect((result as any).consignor.id).toBe(c.id);

    // OTP should be marked as used
    const used = await prisma.otpCode.findFirst({ where: { email: "verify@test.com" } });
    expect(used!.usedAt).not.toBeNull();
  });

  it("ATTACK: verifyOtp rejects wrong code", async () => {
    await createTestConsignor({ email: "wrong@test.com" });
    await requestOtp("wrong@test.com");

    const result = await verifyOtp("wrong@test.com", "000000");
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("Invalid code");
  });

  it("ATTACK: verifyOtp burns OTP after 3 wrong attempts", async () => {
    await createTestConsignor({ email: "brute@test.com" });
    await requestOtp("brute@test.com");

    // 3 wrong attempts exhaust the allowed tries
    await verifyOtp("brute@test.com", "111111");
    await verifyOtp("brute@test.com", "222222");
    await verifyOtp("brute@test.com", "333333");

    // 4th attempt triggers the burn — OTP is marked used
    const result4 = await verifyOtp("brute@test.com", "444444");
    expect((result4 as any).error).toContain("Too many failed attempts");

    // OTP is burned (usedAt set)
    const otp = await prisma.otpCode.findFirst({ where: { email: "brute@test.com" } });
    expect(otp!.usedAt).not.toBeNull();
  });

  it("ATTACK: verifyOtp rejects expired OTP", async () => {
    await createTestConsignor({ email: "expired@test.com" });
    await requestOtp("expired@test.com");

    // Manually expire the OTP
    await prisma.otpCode.updateMany({
      where: { email: "expired@test.com" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const otp = await prisma.otpCode.findFirst({ where: { email: "expired@test.com" } });
    const result = await verifyOtp("expired@test.com", otp!.code);
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("expired");
  });

  it("ATTACK: verifyOtp rejects already-used OTP (replay attack)", async () => {
    await createTestConsignor({ email: "replay@test.com" });
    await requestOtp("replay@test.com");
    const otp = await prisma.otpCode.findFirst({ where: { email: "replay@test.com" } });

    // First use — success
    const result1 = await verifyOtp("replay@test.com", otp!.code);
    expect(result1).toHaveProperty("consignor");

    // Second use — should fail (already used)
    const result2 = await verifyOtp("replay@test.com", otp!.code);
    expect(result2).toHaveProperty("error");
  });

  it("verifyOtp is case-insensitive on email", async () => {
    await createTestConsignor({ email: "case@test.com" });
    await requestOtp("case@test.com");
    const otp = await prisma.otpCode.findFirst({ where: { email: "case@test.com" } });

    const result = await verifyOtp("CASE@test.com", otp!.code);
    expect(result).toHaveProperty("consignor");
  });
});

// ═══════════════════════════════════════════════════════════
// 3. RATE LIMITING — brute force prevention
// ═══════════════════════════════════════════════════════════

describe("Rate limiting", () => {
  it("allows requests under the limit", () => {
    const config = { name: "test-allow", max: 3, windowSec: 60 };
    expect(checkRateLimit("1.2.3.4", config)).toBeNull();
    expect(checkRateLimit("1.2.3.4", config)).toBeNull();
    expect(checkRateLimit("1.2.3.4", config)).toBeNull();
  });

  it("ATTACK: blocks requests over the limit (brute force)", () => {
    const config = { name: "test-block", max: 3, windowSec: 60 };
    checkRateLimit("5.6.7.8", config);
    checkRateLimit("5.6.7.8", config);
    checkRateLimit("5.6.7.8", config);
    const blocked = checkRateLimit("5.6.7.8", config);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it("rate limits are per-IP (different IPs get separate counts)", () => {
    const config = { name: "test-per-ip", max: 2, windowSec: 60 };
    checkRateLimit("10.0.0.1", config);
    checkRateLimit("10.0.0.1", config);
    const blocked = checkRateLimit("10.0.0.1", config);
    expect(blocked).not.toBeNull();
    const allowed = checkRateLimit("10.0.0.2", config);
    expect(allowed).toBeNull();
  });

  it("rate limit response includes Retry-After header", () => {
    const config = { name: "test-retry", max: 1, windowSec: 300 };
    checkRateLimit("9.9.9.9", config);
    const blocked = checkRateLimit("9.9.9.9", config);
    expect(blocked).not.toBeNull();
    const retryAfter = Number(blocked!.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(300);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. INPUT VALIDATION — reject malformed/malicious input
// ═══════════════════════════════════════════════════════════

describe("Input validation — Zod schemas", () => {
  describe("OTP request", () => {
    it("rejects empty email", () => {
      expect(() => parseForm(requestOtpSchema, formDataFrom({ email: "" }))).toThrow();
    });

    it("trims and lowercases email", () => {
      const data = parseForm(requestOtpSchema, formDataFrom({ email: " A@B.com " }));
      expect(data.email).toBe("a@b.com");
    });
  });

  describe("OTP verify", () => {
    it("rejects non-numeric code", () => {
      expect(() =>
        parseForm(verifyOtpSchema, formDataFrom({ email: "a@b.com", code: "abcdef" }))
      ).toThrow();
    });

    it("rejects code shorter than 6 digits", () => {
      expect(() =>
        parseForm(verifyOtpSchema, formDataFrom({ email: "a@b.com", code: "123" }))
      ).toThrow();
    });

    it("accepts valid 6-digit code", () => {
      const data = parseForm(verifyOtpSchema, formDataFrom({ email: "a@b.com", code: "123456" }));
      expect(data.code).toBe("123456");
    });
  });

  describe("Consignor creation", () => {
    it("ATTACK: rejects invalid email format", () => {
      expect(() =>
        parseForm(createConsignorSchema, formDataFrom({ name: "Test", email: "not-an-email", feeRate: "15" }))
      ).toThrow();
    });

    it("ATTACK: rejects email longer than 254 chars", () => {
      const longEmail = "a".repeat(250) + "@b.com";
      expect(() =>
        parseForm(createConsignorSchema, formDataFrom({ name: "Test", email: longEmail, feeRate: "15" }))
      ).toThrow();
    });

    it("ATTACK: rejects name longer than 200 chars", () => {
      expect(() =>
        parseForm(createConsignorSchema, formDataFrom({ name: "A".repeat(201), email: "a@b.com", feeRate: "15" }))
      ).toThrow();
    });

    it("ATTACK: rejects fee rate > 100", () => {
      expect(() =>
        parseForm(createConsignorSchema, formDataFrom({ name: "Test", email: "a@b.com", feeRate: "150" }))
      ).toThrow();
    });

    it("ATTACK: rejects negative fee rate", () => {
      expect(() =>
        parseForm(createConsignorSchema, formDataFrom({ name: "Test", email: "a@b.com", feeRate: "-5" }))
      ).toThrow();
    });

    it("accepts valid consignor", () => {
      const data = parseForm(createConsignorSchema, formDataFrom({
        name: "  John Doe  ", email: "JOHN@example.com", feeRate: "15",
      }));
      expect(data.name).toBe("John Doe");
      expect(data.email).toBe("john@example.com");
      expect(data.feeRate).toBe(15);
    });
  });

  describe("Listing submission", () => {
    it("ATTACK: rejects price of $0", () => {
      expect(() =>
        parseForm(submitListingSchema, formDataFrom({ title: "Shoe", size: "10", price: "0", quantity: "1" }))
      ).toThrow();
    });

    it("ATTACK: rejects negative price", () => {
      expect(() =>
        parseForm(submitListingSchema, formDataFrom({ title: "Shoe", size: "10", price: "-50", quantity: "1" }))
      ).toThrow();
    });

    it("ATTACK: rejects absurdly high price", () => {
      expect(() =>
        parseForm(submitListingSchema, formDataFrom({ title: "Shoe", size: "10", price: "9999999", quantity: "1" }))
      ).toThrow();
    });

    it("ATTACK: rejects quantity > 50", () => {
      expect(() =>
        parseForm(submitListingSchema, formDataFrom({ title: "Shoe", size: "10", price: "100", quantity: "100" }))
      ).toThrow();
    });

    it("rounds price to 2 decimal places", () => {
      const data = parseForm(submitListingSchema, formDataFrom({
        title: "Shoe", size: "10", price: "99.999", quantity: "1",
      }));
      expect(data.price).toBe(100);
    });
  });

  describe("Profile update", () => {
    it("ATTACK: rejects invalid taxStatus enum", () => {
      expect(() =>
        parseForm(updateProfileSchema, formDataFrom({ name: "Test", taxStatus: "hacker" }))
      ).toThrow();
    });

    it("accepts valid profile", () => {
      const data = parseForm(updateProfileSchema, formDataFrom({
        name: "Jane Doe", taxStatus: "business", province: "QC",
        gstNumber: "123456789RT0001", qstNumber: "1234567890TQ",
      }));
      expect(data.taxStatus).toBe("business");
    });
  });

  describe("XSS via form fields", () => {
    it("script tags in name are stored as plain text (React escapes on render)", () => {
      const data = parseForm(createConsignorSchema, formDataFrom({
        name: '<script>alert("xss")</script>',
        email: "xss@test.com",
        feeRate: "15",
      }));
      expect(data.name).toBe('<script>alert("xss")</script>');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 5. AUTHORIZATION — can't access other consignors' data
// ═══════════════════════════════════════════════════════════

describe("Authorization — ownership checks", () => {
  it("ATTACK: consignor cannot delete another consignor's listing", async () => {
    const victim = await createTestConsignor({ email: "victim@test.com" });
    const attacker = await createTestConsignor({ email: "attacker@test.com" });

    const product = await prisma.product.create({ data: { title: "Victim's Shoe", brand: "Nike" } });
    const variant = await prisma.variant.create({ data: { size: "10", productId: product.id } });
    const listing = await prisma.listing.create({
      data: { variantId: variant.id, consignorId: victim.id, price: 100, status: "submitted" },
    });

    const { deleteSubmittedListing } = await import("~/services/submission.server");
    await expect(
      deleteSubmittedListing({ listingId: listing.id, consignorId: attacker.id })
    ).rejects.toThrow();
  });

  it("ATTACK: consignor cannot edit another consignor's listing", async () => {
    const victim = await createTestConsignor({ email: "victim3@test.com" });
    const attacker = await createTestConsignor({ email: "attacker3@test.com" });

    const product = await prisma.product.create({ data: { title: "Victim's Shoe 3", brand: "Nike" } });
    const variant = await prisma.variant.create({ data: { size: "9", productId: product.id } });
    const listing = await prisma.listing.create({
      data: { variantId: variant.id, consignorId: victim.id, price: 200, status: "submitted" },
    });

    const { updateSubmittedListing } = await import("~/services/submission.server");
    await expect(
      updateSubmittedListing({ listingId: listing.id, consignorId: attacker.id, size: "9", price: 1 })
    ).rejects.toThrow();
  });

  it("ATTACK: consignor cannot request withdrawal on another's listing", async () => {
    const victim = await createTestConsignor({ email: "victim4@test.com" });
    const attacker = await createTestConsignor({ email: "attacker4@test.com" });

    const product = await prisma.product.create({ data: { title: "Victim's Shoe 4", brand: "Nike" } });
    const variant = await prisma.variant.create({ data: { size: "11", productId: product.id } });
    const listing = await prisma.listing.create({
      data: { variantId: variant.id, consignorId: victim.id, price: 300, status: "active" },
    });

    const { requestWithdrawal } = await import("~/services/submission.server");
    await expect(
      requestWithdrawal({ listingId: listing.id, consignorId: attacker.id })
    ).rejects.toThrow();
  });
});
