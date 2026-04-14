import { logger } from "~/lib/logger.server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

/**
 * Send a 6-digit OTP code via email.
 * Falls back to logger.info in dev when no API key is set.
 */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
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

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error("Failed to send OTP email", { error: String(error) });
    throw new Error("Failed to send verification code. Please try again.");
  }
}
