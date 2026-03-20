import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright config for consignment app E2E tests.
 *
 * Prerequisites:
 *   1. `shopify app dev` must be running (creates the tunnel)
 *   2. Set env vars: SHOPIFY_ADMIN_EMAIL, SHOPIFY_ADMIN_PASSWORD, SHOPIFY_STORE_HANDLE
 *      (in tests/e2e/.env.test or environment)
 *   3. App must be installed on the dev store
 */

// Load .env.test if it exists
config({ path: path.resolve(__dirname, ".env.test") });

const STORE_HANDLE = process.env.SHOPIFY_STORE_HANDLE ?? "";
const ADMIN_BASE = `https://admin.shopify.com/store/${STORE_HANDLE}`;

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "junit" : "html",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: ADMIN_BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "setup",
      testMatch: /shopify-auth\.setup\.ts/,
      testDir: "./auth",
      use: {
        channel: "chrome",
        launchOptions: {
          args: ["--disable-blink-features=AutomationControlled"],
        },
      },
    },
    {
      name: "chromium",
      use: {
        channel: "chrome",
        launchOptions: {
          args: ["--disable-blink-features=AutomationControlled"],
        },
        storageState: path.resolve(__dirname, "auth/storage-state.json"),
      },
      dependencies: ["setup"],
    },
  ],
});
