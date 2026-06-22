// OTP login flow verification (requestOtp + verifyOtp).
// Uses a real consignor email; SIMULATION_MODE=1 suppresses the OTP email.
// Cleans up all OtpCode rows it creates at the end.

import { prisma, check, printSummary, header } from "./_shared.js";
import { requestOtp, verifyOtp } from "~/services/otp/otp.server.js";

const TEST_EMAIL = "meryachkanou@gmail.com"; // betchu kicks (active)

async function cleanup() {
  await prisma.otpCode.deleteMany({ where: { email: TEST_EMAIL } });
}

async function latestCode(): Promise<string | null> {
  const otp = await prisma.otpCode.findFirst({
    where: { email: TEST_EMAIL, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return otp?.code ?? null;
}

async function main() {
  header("scripts/sim/06-otp.ts");
  await cleanup();

  const consignor = await prisma.consignor.findUnique({ where: { email: TEST_EMAIL } });
  if (!consignor) { console.error(`Test consignor ${TEST_EMAIL} not found`); process.exit(1); }

  // 1. requestOtp creates a code
  const r1 = await requestOtp(TEST_EMAIL);
  const code1 = await latestCode();
  check({
    name: "1. requestOtp succeeds + creates a 6-digit code",
    expected: "success=true, code is 6 digits",
    actual: `success=${r1.success}, code=${code1}`,
    ok: r1.success === true && !!code1 && /^\d{6}$/.test(code1),
  });

  // 2. verifyOtp with WRONG code -> error + attempts increment
  const wrong = await verifyOtp(TEST_EMAIL, "000000" === code1 ? "111111" : "000000");
  check({
    name: "2. verifyOtp rejects wrong code",
    expected: "error returned, no consignor",
    actual: "error" in wrong ? `error: ${wrong.error}` : "unexpectedly succeeded",
    ok: "error" in wrong,
  });

  // 3. verifyOtp with CORRECT code -> returns consignor
  const right = await verifyOtp(TEST_EMAIL, code1!);
  check({
    name: "3. verifyOtp accepts correct code -> consignor",
    expected: `consignor ${consignor.name}`,
    actual: "consignor" in right && right.consignor ? right.consignor.name : `error: ${(right as any).error}`,
    ok: "consignor" in right && right.consignor?.id === consignor.id,
  });

  // 4. Reusing the now-used code fails
  const reuse = await verifyOtp(TEST_EMAIL, code1!);
  check({
    name: "4. Used code cannot be reused",
    expected: "error (code already used)",
    actual: "error" in reuse ? `error: ${reuse.error}` : "unexpectedly succeeded",
    ok: "error" in reuse,
  });

  // 5. Max-attempts lockout: request fresh, then 3 wrong tries -> burned
  await cleanup();
  await requestOtp(TEST_EMAIL);
  const code5 = await latestCode();
  const badGuess = code5 === "123456" ? "654321" : "123456";
  await verifyOtp(TEST_EMAIL, badGuess);
  await verifyOtp(TEST_EMAIL, badGuess);
  await verifyOtp(TEST_EMAIL, badGuess);
  // 4th attempt should be locked out even with the CORRECT code
  const afterLockout = await verifyOtp(TEST_EMAIL, code5!);
  check({
    name: "5. Code is burned after 3 failed attempts (correct code then rejected)",
    expected: "error (too many attempts)",
    actual: "error" in afterLockout ? `error: ${afterLockout.error}` : "unexpectedly succeeded",
    ok: "error" in afterLockout,
  });

  // 6. Expired code is rejected
  await cleanup();
  await prisma.otpCode.create({
    data: { email: TEST_EMAIL, code: "999999", expiresAt: new Date(Date.now() - 60_000) },
  });
  const expired = await verifyOtp(TEST_EMAIL, "999999");
  check({
    name: "6. Expired code is rejected",
    expected: "error (invalid or expired)",
    actual: "error" in expired ? `error: ${expired.error}` : "unexpectedly succeeded",
    ok: "error" in expired,
  });

  // 7. Unknown email returns fake success (anti-enumeration), no code created
  await prisma.otpCode.deleteMany({ where: { email: "definitely-not-a-consignor@example.com" } });
  const unknown = await requestOtp("definitely-not-a-consignor@example.com");
  const unknownCode = await prisma.otpCode.findFirst({ where: { email: "definitely-not-a-consignor@example.com" } });
  check({
    name: "7. Unknown email -> fake success, no code created (anti-enumeration)",
    expected: "success=true, 0 codes",
    actual: `success=${unknown.success}, codeRow=${unknownCode ? "created" : "none"}`,
    ok: unknown.success === true && !unknownCode,
  });

  // 8. Rate limit probe: 4 rapid requests. Documented as "max 3 per hour".
  await cleanup();
  const results: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await requestOtp(TEST_EMAIL);
    results.push(!!r.error && /too many/i.test(r.error));
  }
  const anyRateLimited = results.some(Boolean);
  check({
    name: "8. Rate limit: >3 requests/hour should be rejected",
    expected: "at least one of 5 rapid requests rate-limited",
    actual: anyRateLimited ? "rate limit fired" : "NO request was rate-limited (limit ineffective)",
    ok: anyRateLimited,
    details: anyRateLimited ? undefined :
      "FINDING: requestOtp deletes all prior OtpCode rows for the email (otp.server.ts:42) BEFORE the\n" +
      "rate-limit count window can accumulate (otp.server.ts:35-38), so the count never exceeds 1 and the\n" +
      "'max 3 per hour' guard never triggers. The rate limit is effectively dead code.",
  });

  await cleanup();
  printSummary();
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (err) => { console.error("\nFATAL:", err); await cleanup().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
