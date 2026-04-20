import { logger } from "~/lib/system";
import { fmt } from "~/lib/formatting";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const STORE_NAME = "Konsign";

// ── Core send function ──

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY || process.env.NODE_ENV !== "production") {
    logger.info("[DEV] Email would send", { to, subject });
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });

  if (error) {
    logger.error("Email send failed", { to, subject, error: String(error) });
    throw new Error("Failed to send email");
  }
}

// ── Email wrapper (respects consignor prefs) ──

async function sendIfEnabled(
  consignor: { email: string; notificationPrefs?: string | null },
  subject: string,
  html: string,
): Promise<void> {
  try {
    const prefs = consignor.notificationPrefs ? JSON.parse(consignor.notificationPrefs) : {};
    if (prefs.email === false) return;
  } catch { /* malformed prefs = send anyway */ }

  try {
    await sendEmail(consignor.email, subject, html);
  } catch (err) {
    logger.error("Email delivery failed", { to: consignor.email, subject, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Shared template wrapper ──

function wrap(title: string, body: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 440px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px;">${title}</h2>
      ${body}
      <p style="font-size: 11px; color: #9ca3af; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        ${STORE_NAME} — Consignment Marketplace
      </p>
    </div>
  `;
}

function pill(label: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;font-size:12px;font-weight:600;border-radius:999px;background:${color};color:#fff;">${label}</span>`;
}

// ── OTP ──

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendEmail(to, `Your ${STORE_NAME} login code: ${code}`, wrap("Your login code", `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">Enter this code to sign in:</p>
    <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</span>
    </div>
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">This code expires in 5 minutes.</p>
  `));
}

// ── Item Sold ──

export async function sendItemSoldEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  item: { product: string; size: string; salePrice: number; payoutAmount: number },
): Promise<void> {
  await sendIfEnabled(consignor, `Your item sold — $${fmt(item.payoutAmount)} earned`, wrap("Item Sold! 🎉", `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Great news — one of your items just sold.</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${item.product}</p>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">Size ${item.size} — Sold for $${fmt(item.salePrice)}</p>
      <p style="margin: 8px 0 0; font-size: 18px; font-weight: 700; color: #16a34a;">Your payout: $${fmt(item.payoutAmount)}</p>
    </div>
  `));
}

// ── Payout Ready ──

export async function sendPayoutReadyEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  payout: { amount: number; itemCount: number },
): Promise<void> {
  await sendIfEnabled(consignor, `Payout of $${fmt(payout.amount)} is ready`, wrap("Payout Ready", `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">A payout has been created for your account.</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
      <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1d4ed8;">$${fmt(payout.amount)}</p>
      <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${payout.itemCount} item${payout.itemCount !== 1 ? "s" : ""}</p>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin: 0;">If you're a registered business, please submit your invoice to receive payment.</p>
  `));
}

// ── Withdrawal Approved ──

export async function sendWithdrawalApprovedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  item: { product: string; size: string },
): Promise<void> {
  await sendIfEnabled(consignor, `Withdrawal approved — ready for pickup`, wrap("Withdrawal Approved", `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Your withdrawal request has been approved.</p>
    <div style="background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${item.product}</p>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">Size ${item.size}</p>
    </div>
    <p style="font-size: 14px; color: #111827; font-weight: 500; margin: 0;">Please come pick up your item at the store.</p>
  `));
}

// ── Listing Approved ──

export async function sendListingApprovedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string }>,
): Promise<void> {
  const count = items.length;
  const subject = count === 1
    ? `Listing approved — ready for drop-off`
    : `${count} listings approved — ready for drop-off`;

  const itemsHtml = items.map((item) => `
    <div style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
      <span style="font-weight: 600; color: #111827;">${item.product}</span>
      <span style="font-size: 13px; color: #6b7280;"> — Size ${item.size}</span>
    </div>
  `).join("");

  await sendIfEnabled(consignor, subject, wrap(count === 1 ? "Listing Approved" : `${count} Listings Approved`, `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Your ${count === 1 ? "listing has" : "listings have"} been approved.</p>
    <div style="background: #e0f7f6; border: 1px solid #99f0e4; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;">
      ${itemsHtml}
    </div>
    <p style="font-size: 14px; color: #111827; font-weight: 500; margin: 0;">Please bring your ${count === 1 ? "item" : "items"} to the store for drop-off.</p>
  `));
}

// ── Listing Checked In (live on store) ──

export async function sendListingLiveEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string }>,
): Promise<void> {
  const count = items.length;
  const subject = count === 1
    ? `Drop-off confirmed — your item is live!`
    : `Drop-off confirmed — ${count} items are live!`;

  const itemsHtml = items.map((item) => `
    <div style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
      <span style="font-weight: 600; color: #111827;">${item.product}</span>
      <span style="font-size: 13px; color: #6b7280;"> — Size ${item.size}</span>
    </div>
  `).join("");

  await sendIfEnabled(consignor, subject, wrap(count === 1 ? "Your Item is Live!" : `${count} Items Are Live!`, `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Drop-off confirmed. Your ${count === 1 ? "item is" : "items are"} now listed on the store.</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;">
      ${itemsHtml}
    </div>
    <p style="font-size: 13px; color: #6b7280; margin: 0;">You'll be notified when ${count === 1 ? "it sells" : "they sell"}.</p>
  `));
}

// ── Submission Confirmed ──

export async function sendSubmissionConfirmedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  item: { product: string; size: string; price: number },
): Promise<void> {
  await sendIfEnabled(consignor, `Listing submitted — awaiting review`, wrap("Submission Received", `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Your listing has been submitted and is awaiting admin review.</p>
    <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${item.product}</p>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">Size ${item.size} — $${fmt(item.price)}</p>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin: 0;">We'll notify you once it's approved or if we need any changes.</p>
  `));
}

// ── Listing Rejected ──

export async function sendListingRejectedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  item: { product: string; size: string; reason: string },
): Promise<void> {
  await sendIfEnabled(consignor, `Listing rejected — ${item.product}`, wrap("Listing Rejected", `
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Unfortunately, your listing was not approved.</p>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${item.product}</p>
      <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">Size ${item.size}</p>
      <p style="margin: 0; font-size: 13px; color: #dc2626;"><strong>Reason:</strong> ${item.reason}</p>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin: 0;">You can make changes and resubmit if you'd like.</p>
  `));
}

// ── Account Suspended ──

export async function sendAccountSuspendedEmail(
  consignor: { email: string },
  reason?: string,
): Promise<void> {
  // No preference check — suspension notice always sends
  try {
    await sendEmail(consignor.email, `Your ${STORE_NAME} account has been suspended`, wrap("Account Suspended", `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Your consignment account has been suspended.</p>
      ${reason ? `<p style="font-size: 13px; color: #dc2626; margin: 0 0 16px;"><strong>Reason:</strong> ${reason}</p>` : ""}
      <p style="font-size: 13px; color: #6b7280; margin: 0;">Please contact the store for more information.</p>
    `));
  } catch (err) {
    logger.error("Email delivery failed", { to: consignor.email, subject: "Account suspended", error: err instanceof Error ? err.message : String(err) });
  }
}
