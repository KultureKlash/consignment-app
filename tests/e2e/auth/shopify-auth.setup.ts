import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_STATE = path.resolve(__dirname, "storage-state.json");

/**
 * Auth setup for Shopify Admin.
 *
 * Shopify's login has bot detection (passkey prompts, device verification)
 * that makes fully automated login unreliable. Instead:
 *
 * 1. Run: npx playwright test --config tests/e2e/playwright.config.ts --project=setup --headed
 * 2. Log in manually in the browser that opens (handle passkey/verification prompts)
 * 3. The storage state is saved automatically when the admin dashboard loads
 * 4. Subsequent test runs reuse the saved cookies (no login needed)
 *
 * The saved state expires after ~24h. Re-run setup when it does.
 */
setup.setTimeout(180_000); // 3 minutes for manual login
setup("authenticate with Shopify Admin", async ({ page }) => {
  const store = process.env.SHOPIFY_STORE_HANDLE;

  if (!store) {
    throw new Error(
      "Missing SHOPIFY_STORE_HANDLE env var. Set it in tests/e2e/.env.test"
    );
  }

  // Check if we already have valid storage state
  if (fs.existsSync(STORAGE_STATE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf-8"));
      if (state.cookies && state.cookies.length > 0) {
        // Try loading the saved state and navigating to admin
        await page.context().addCookies(state.cookies);
        await page.goto(`https://admin.shopify.com/store/${store}`, {
          timeout: 15_000,
        });

        // If we land on admin (not login), the state is still valid
        const url = page.url();
        if (url.includes("admin.shopify.com") && !url.includes("login") && !url.includes("accounts.shopify.com")) {
          console.log("Existing auth state is valid — skipping login");
          return;
        }
      }
    } catch {
      // Invalid state file, continue with manual login
    }
  }

  // Navigate to Shopify Admin — will redirect to login
  await page.goto(`https://admin.shopify.com/store/${store}`);

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  LOG IN MANUALLY in the browser window that opened  ║");
  console.log("║  Handle any passkey/verification prompts yourself   ║");
  console.log("║  The test will continue once you reach the admin    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Wait up to 2 minutes for the user to manually log in
  await page.waitForURL((url) => {
    const href = url.toString();
    return (
      href.includes("admin.shopify.com/store/") &&
      !href.includes("login") &&
      !href.includes("accounts.shopify.com")
    );
  }, { timeout: 120_000 });

  console.log("Login successful! Saving auth state...");

  // Save authentication state for future runs
  await page.context().storageState({ path: STORAGE_STATE });
});
