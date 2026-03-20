import { test as base, type Page } from "@playwright/test";

const STORE_HANDLE = process.env.SHOPIFY_STORE_HANDLE ?? "";
const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE ?? "consignment-app";

export type AppFixtures = {
  adminPage: Page;
};

/**
 * Extended test fixture that navigates to the embedded app.
 * The app renders directly in Shopify Admin (no iframe in newer versions).
 */
export const test = base.extend<AppFixtures>({
  adminPage: async ({ page }, use) => {
    // Navigate directly to the app
    await page.goto(
      `https://admin.shopify.com/store/${STORE_HANDLE}/apps/${APP_HANDLE}`,
      { waitUntil: "domcontentloaded" }
    );

    // Wait for the app heading to appear
    await page.locator("text=Test Panel").first().waitFor({ timeout: 30_000 });

    await use(page);
  },
});

export { expect } from "@playwright/test";
