import { logger } from "~/lib/system";
import { fmt } from "~/lib/formatting";
import { WITHDRAWAL_FEE_PER_ITEM } from "~/lib/finance";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const STORE_NAME = "Konsign";

// ── Core send function ──

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (process.env.SIMULATION_MODE === "1") {
    logger.info("Email skipped (SIMULATION_MODE)", { to, subject });
    return;
  }
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
// Mobile-first: max-width 440px, system fonts, tight vertical rhythm. No em-dashes.
// `preview` is the hidden snippet that mail clients (Gmail, Apple Mail) show in the
// inbox preview row — keep it short and lead with the news.

function wrap(opts: { title: string; body: string; preview: string }): string {
  return `
    <!-- Preview text: shown in inbox preview, hidden in body -->
    <div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${opts.preview}</div>
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 440px; margin: 0 auto; padding: 32px 24px; color: #111827;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px;">${opts.title}</h2>
      ${opts.body}
      <p style="font-size: 11px; color: #9ca3af; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">${STORE_NAME}</p>
    </div>
  `;
}

// Single item line in a card. Used by every list-style email.
function itemLine(product: string, size: string, suffix?: string): string {
  return `
    <div style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
      <span style="font-weight: 600; color: #111827;">${product}</span>
      <span style="font-size: 13px; color: #6b7280;"> · Size ${size}${suffix ?? ""}</span>
    </div>
  `;
}

// ── OTP ──

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendEmail(to, `Your ${STORE_NAME} code: ${code}`, wrap({
    preview: `Sign-in code: ${code}. Expires in 5 minutes.`,
    title: "Your login code",
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">Enter this code to sign in.</p>
      <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</span>
      </div>
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">Expires in 5 minutes.</p>
    `,
  }));
}

// ── Item(s) Sold ──
// Always sends (bypasses email prefs). One consolidated email per consignor
// when a single order contains multiple of their items.

export async function sendItemSoldEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string; salePrice: number; payoutAmount: number }>,
): Promise<void> {
  if (items.length === 0) return;

  const count = items.length;
  const totalPayout = items.reduce((sum, i) => sum + i.payoutAmount, 0);

  const subject = count === 1
    ? `Sold for $${fmt(items[0].salePrice)}. $${fmt(totalPayout)} added to your balance.`
    : `${count} items sold. $${fmt(totalPayout)} added to your balance.`;

  const itemsHtml = items.map((item) => `
    <div style="padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
      <div style="font-weight: 600; color: #111827;">${item.product}</div>
      <div style="display: flex; justify-content: space-between; margin-top: 2px;">
        <span style="font-size: 13px; color: #6b7280;">Size ${item.size} · $${fmt(item.salePrice)}</span>
        <span style="font-size: 13px; font-weight: 700; color: #16a34a;">+$${fmt(item.payoutAmount)}</span>
      </div>
    </div>
  `).join("");

  const totalLine = count > 1
    ? `<p style="margin: 12px 0 0; font-size: 18px; font-weight: 700; color: #16a34a; text-align: right;">+$${fmt(totalPayout)} total</p>`
    : "";

  try {
    await sendEmail(consignor.email, subject, wrap({
      preview: count === 1
        ? `+$${fmt(totalPayout)} added to your balance.`
        : `${count} items sold. +$${fmt(totalPayout)} total.`,
      title: count === 1 ? "Sold" : `${count} items sold`,
      body: `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 6px 16px; margin: 0 0 16px;">
          ${itemsHtml}
          ${totalLine}
        </div>
        <p style="font-size: 13px; color: #6b7280; margin: 0;">Your balance updates automatically. View it in your portal under Payouts.</p>
      `,
    }));
  } catch (err) {
    logger.error("Email delivery failed", { to: consignor.email, subject: "Item sold", error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Payout Ready ──

export async function sendPayoutReadyEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  payout: { amount: number; itemCount: number },
): Promise<void> {
  const amountStr = `$${fmt(payout.amount)}`;
  await sendIfEnabled(consignor, `Payout ready: ${amountStr}`, wrap({
    preview: `${amountStr} payout created for ${payout.itemCount} item${payout.itemCount !== 1 ? "s" : ""}.`,
    title: "Payout ready",
    body: `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
        <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1d4ed8;">${amountStr}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${payout.itemCount} item${payout.itemCount !== 1 ? "s" : ""}</p>
      </div>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">If you're a registered business, send your invoice from the portal to receive payment.</p>
    `,
  }));
}

// ── Payout Paid ──
// Always sends. Proof of payment is needed for tax and legal records.

export async function sendPayoutPaidEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  payout: { amount: number; itemCount: number; totalWithTax?: number; isTaxable?: boolean },
): Promise<void> {
  const displayAmount = payout.isTaxable && payout.totalWithTax ? payout.totalWithTax : payout.amount;
  const amountStr = `$${fmt(displayAmount)}`;
  const taxLine = payout.isTaxable && payout.totalWithTax
    ? `<p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">$${fmt(payout.amount)} + tax = $${fmt(payout.totalWithTax)}</p>`
    : "";

  try {
    await sendEmail(consignor.email, `Payment sent: ${amountStr}`, wrap({
      preview: `${amountStr} sent. Funds will arrive based on your payment method.`,
      title: "Payment sent",
      body: `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
          <p style="margin: 0; font-size: 22px; font-weight: 700; color: #047857;">${amountStr} sent</p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${payout.itemCount} item${payout.itemCount !== 1 ? "s" : ""}</p>
          ${taxLine}
        </div>
        <p style="font-size: 13px; color: #6b7280; margin: 0;">Funds will arrive based on your payment method. The full statement is in your portal under <strong>Payouts</strong>.</p>
      `,
    }));
  } catch (err) {
    logger.error("Email delivery failed", { to: consignor.email, subject: "Payment sent", error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Withdrawal Approved ──

export async function sendWithdrawalApprovedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string }>,
): Promise<void> {
  const count = items.length;
  const totalFee = count * WITHDRAWAL_FEE_PER_ITEM;
  const subject = count === 1
    ? `Withdrawal approved. Pick up at the store.`
    : `${count} withdrawals approved. Pick up at the store.`;

  const itemsHtml = items.map((item) => itemLine(item.product, item.size)).join("");

  await sendIfEnabled(consignor, subject, wrap({
    preview: count === 1
      ? `Ready for pickup at the store. Pickup fee $${fmt(totalFee)}.`
      : `${count} items ready for pickup. Pickup fee $${fmt(totalFee)}.`,
    title: count === 1 ? "Ready for pickup" : `${count} ready for pickup`,
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Come by the store whenever you're ready.</p>
      <div style="background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;">
        ${itemsHtml}
      </div>
      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 12px; padding: 12px 16px; margin: 0;">
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #92400e;">Pickup fee: ${count} item${count !== 1 ? "s" : ""} × $${fmt(WITHDRAWAL_FEE_PER_ITEM)} = $${fmt(totalFee)}</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #92400e;">Pay at the counter. Card or cash.</p>
      </div>
    `,
  }));
}

// ── Withdrawal Denied ──

export async function sendWithdrawalDeniedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string }>,
  reason?: string,
): Promise<void> {
  const count = items.length;
  const subject = count === 1
    ? `Withdrawal request update`
    : `Withdrawal requests update`;

  const itemsHtml = items.map((item) => itemLine(item.product, item.size)).join("");

  const reasonBlock = reason && reason.trim()
    ? `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;"><p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Reason:</strong> ${reason.trim()}</p></div>`
    : "";

  await sendIfEnabled(consignor, subject, wrap({
    preview: count === 1
      ? `Your withdrawal wasn't approved this time. The listing stays active.`
      : `${count} withdrawals weren't approved this time. They stay active.`,
    title: count === 1 ? "Request update" : "Requests update",
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">We couldn't approve your request${count === 1 ? "" : "s"} this time. ${count === 1 ? "It stays" : "They stay"} active for sale.</p>
      <div style="background: #fef3f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;">
        ${itemsHtml}
      </div>
      ${reasonBlock}
      <p style="font-size: 13px; color: #6b7280; margin: 0;">Reach out if you have questions.</p>
    `,
  }));
}

// ── Listing Approved ──

export async function sendListingApprovedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string }>,
): Promise<void> {
  const count = items.length;
  const subject = count === 1
    ? `Approved. Drop it off when ready.`
    : `${count} approved. Drop them off when ready.`;

  const itemsHtml = items.map((item) => itemLine(item.product, item.size)).join("");

  await sendIfEnabled(consignor, subject, wrap({
    preview: count === 1
      ? `Your listing is approved. Drop it off whenever you can.`
      : `${count} listings approved. Drop them off whenever you can.`,
    title: count === 1 ? "Approved" : `${count} approved`,
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Bring ${count === 1 ? "your item" : "them"} to the store whenever you can.</p>
      <div style="background: #e0f7f6; border: 1px solid #99f0e4; border-radius: 12px; padding: 12px 16px; margin: 0;">
        ${itemsHtml}
      </div>
    `,
  }));
}

// ── Listing Checked In (live on store) ──

export async function sendListingLiveEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  items: Array<{ product: string; size: string }>,
): Promise<void> {
  const count = items.length;
  const subject = count === 1 ? `You're live on the store` : `${count} items live on the store`;

  const itemsHtml = items.map((item) => itemLine(item.product, item.size)).join("");

  await sendIfEnabled(consignor, subject, wrap({
    preview: count === 1
      ? `Drop-off confirmed. You're listed and selling.`
      : `Drop-off confirmed. ${count} items are listed and selling.`,
    title: count === 1 ? "Live" : `${count} live`,
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Drop-off confirmed. ${count === 1 ? "Your item is" : "Your items are"} now selling.</p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;">
        ${itemsHtml}
      </div>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">We'll email you the second ${count === 1 ? "it" : "any"} sells.</p>
    `,
  }));
}

// ── Submission Confirmed ──

export async function sendSubmissionConfirmedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  item: { product: string; size: string; price: number; quantity?: number },
): Promise<void> {
  const qty = item.quantity ?? 1;
  const priceStr = `$${fmt(item.price)}`;
  const subject = qty > 1
    ? `${qty} listings submitted. Awaiting review.`
    : `Submitted. Awaiting review.`;
  const title = qty > 1 ? `${qty} submitted` : "Submitted";
  const sizeLine = qty > 1
    ? `${qty} × Size ${item.size} · ${priceStr} each`
    : `Size ${item.size} · ${priceStr}`;

  await sendIfEnabled(consignor, subject, wrap({
    preview: qty > 1
      ? `${qty} listings submitted. We'll review them shortly.`
      : `Listing submitted. We'll review it shortly.`,
    title,
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">We're reviewing ${qty > 1 ? "your listings" : "your listing"} now.</p>
      <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
        <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${item.product}</p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">${sizeLine}</p>
      </div>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">You'll hear back from us soon.</p>
    `,
  }));
}

// ── Listing Rejected ──

export async function sendListingRejectedEmail(
  consignor: { email: string; notificationPrefs?: string | null },
  item: { product: string; size: string; reason: string },
): Promise<void> {
  await sendIfEnabled(consignor, `Listing not approved: ${item.product}`, wrap({
    preview: `Your listing wasn't approved. Reason: ${item.reason.slice(0, 80)}`,
    title: "Listing not approved",
    body: `
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">We couldn't take this listing.</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
        <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${item.product}</p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">Size ${item.size}</p>
        <p style="margin: 0; font-size: 13px; color: #dc2626;"><strong>Reason:</strong> ${item.reason}</p>
      </div>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">Adjust and resubmit if you'd like.</p>
    `,
  }));
}

// ── Account Suspended ──

export async function sendAccountSuspendedEmail(
  consignor: { email: string },
  reason?: string,
): Promise<void> {
  // No preference check. Suspension notice always sends.
  try {
    await sendEmail(consignor.email, `Your ${STORE_NAME} account was suspended`, wrap({
      preview: reason ? `Suspended. Reason: ${reason.slice(0, 80)}` : "Your consignment account was suspended.",
      title: "Account suspended",
      body: `
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Your consignment account was suspended.</p>
        ${reason ? `<p style="font-size: 13px; color: #dc2626; margin: 0 0 16px;"><strong>Reason:</strong> ${reason}</p>` : ""}
        <p style="font-size: 13px; color: #6b7280; margin: 0;">Reach out to the store for more info.</p>
      `,
    }));
  } catch (err) {
    logger.error("Email delivery failed", { to: consignor.email, subject: "Account suspended", error: err instanceof Error ? err.message : String(err) });
  }
}
