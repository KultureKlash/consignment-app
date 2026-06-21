// Shared utilities for all scripts/sim/* scripts.
//   - Loads the (commented-out) Neon DATABASE_URL from .env
//   - Sets SIMULATION_MODE=1 so email.server.ts short-circuits Resend
//   - Exposes a `check()` helper that prints "expected vs actual" rows and
//     tracks pass/fail; `printSummary()` exits non-zero on any failure.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found (commented postgresql://...neon.tech line in .env)");
  return m[1];
}

process.env.DATABASE_URL = loadNeonDatabaseUrl();
process.env.SIMULATION_MODE = "1";

export const prisma = new PrismaClient();

// ── Result tracking ──

export type CheckResult = {
  name: string;
  expected: string;
  actual: string;
  ok: boolean;
  details?: string;
};

let totalChecks = 0;
let passedChecks = 0;
const failedChecks: CheckResult[] = [];

export function check(result: CheckResult): void {
  totalChecks++;
  if (result.ok) passedChecks++;
  else failedChecks.push(result);
  const tag = result.ok ? "[PASS]" : "[FAIL]";
  console.log(`\n${tag} ${result.name}`);
  console.log(`  Expected: ${result.expected}`);
  console.log(`  Actual:   ${result.actual}`);
  if (result.details) {
    for (const line of result.details.split("\n")) {
      console.log(`  ${line}`);
    }
  }
}

export function printSummary(): void {
  const bar = "-".repeat(60);
  console.log(`\n${bar}`);
  console.log(`SUMMARY: ${passedChecks}/${totalChecks} checks passed`);
  if (failedChecks.length > 0) {
    console.log(`\nFailures (${failedChecks.length}):`);
    for (const f of failedChecks) console.log(`  - ${f.name}`);
    process.exitCode = 1;
  } else {
    console.log("All checks passed.");
  }
}

export function header(title: string): void {
  const bar = "=".repeat(60);
  console.log(`\n${bar}\n${title}\n${bar}`);
}
