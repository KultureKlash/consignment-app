import { randomInt, timingSafeEqual } from "crypto";
import prisma from "~/db.server";
import { logger } from "~/lib/logger.server";

// ── OTP Email ──

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

async function sendOtpEmail(to: string, code: string): Promise<void> {
  const subject = `Your Konsign login code: ${code}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 8px;">Your login code</h2>
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">Enter this code to sign in to Konsign:</p>
      <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</span>
      </div>
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!RESEND_API_KEY) {
    logger.info("[DEV] OTP code generated", { to, code });
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });

  if (error) {
    logger.error("Failed to send OTP email", { error: String(error) });
    throw new Error("Failed to send verification code. Please try again.");
  }
}

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
    return { error: "Failed to send verification code. Please try again." };
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
