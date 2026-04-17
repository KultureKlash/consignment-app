import { randomInt, timingSafeEqual } from "crypto";
import prisma from "~/db.server";
import { sendOtpEmail } from "~/services/email.server";

// ── OTP Logic ──

const OTP_EXPIRY_SECONDS = 5 * 60; // 5 minutes
const MAX_ATTEMPTS = 3;

/**
 * Request a new OTP for the given email.
 * Returns `{ success: true }` or `{ error: string }`.
 * Uses generic errors to prevent email enumeration.
 */
export async function requestOtp(email: string): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Check consignor exists (generic error to prevent enumeration)
  const consignor = await prisma.consignor.findUnique({
    where: { email: normalizedEmail },
  });

  if (!consignor) {
    // Don't reveal that the email doesn't exist — fake success
    return { success: true };
  }

  if (consignor.status === "suspended") {
    return { error: "Your account has been suspended. Please contact the store for more information." };
  }

  // Per-email rate limit: max 3 OTP requests per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: { email: normalizedEmail, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= 3) {
    return { error: "Too many code requests. Please wait before trying again." };
  }

  await prisma.otpCode.deleteMany({ where: { email: normalizedEmail } });

  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  await prisma.otpCode.create({
    data: { email: normalizedEmail, code, expiresAt },
  });

  // Send email (logs to console in dev if no RESEND_API_KEY)
  try {
    await sendOtpEmail(normalizedEmail, code);
  } catch {
    // In production, block login if email fails. In dev, let it through (code is in terminal logs).
    if (process.env.NODE_ENV === "production") {
      return { error: "Failed to send verification code. Please try again." };
    }
  }

  // Opportunistically clean old OTPs
  cleanExpiredOtps().catch(() => {});

  return { success: true };
}

/**
 * Verify an OTP code for the given email.
 * Returns `{ consignor }` on success or `{ error }` on failure.
 */
export async function verifyOtp(email: string, code: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const otp = await prisma.otpCode.findFirst({
    where: {
      email: normalizedEmail,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { error: "Invalid or expired code. Please request a new one." };
  }

  // Check max attempts
  if (otp.attempts >= MAX_ATTEMPTS) {
    // Burn the OTP
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });
    return { error: "Too many failed attempts. Please request a new code." };
  }

  // Wrong code — constant-time comparison to prevent timing attacks
  const codeMatch =
    otp.code.length === code.length &&
    timingSafeEqual(Buffer.from(otp.code), Buffer.from(code));
  if (!codeMatch) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: otp.attempts + 1 },
    });
    const remaining = MAX_ATTEMPTS - otp.attempts - 1;
    return { error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` };
  }

  // Correct code — mark as used
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  const consignor = await prisma.consignor.findUnique({
    where: { email: normalizedEmail },
  });

  if (!consignor) {
    return { error: "Invalid code or email. Please try again." };
  }

  if (consignor.status === "suspended") {
    return { error: "Your account has been suspended. Please contact the store for more information." };
  }

  return { consignor };
}

/** Delete OTPs older than 1 hour (maintenance). */
async function cleanExpiredOtps() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.otpCode.deleteMany({
    where: { createdAt: { lt: oneHourAgo } },
  });
}
