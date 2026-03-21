import { test, expect } from "../fixtures/base.fixture";
import { countActiveListings, getAllListings, disconnect } from "../helpers/db";
import type { Page } from "@playwright/test";

test.afterAll(async () => {
  await disconnect();
});

/**
 * Click an s-button by matching its text content.
 * Shopify web components render button text inside Shadow DOM,
 * so we use evaluate to find and click them.
 */
async function clickPreset(page: Page, textMatch: string) {
  // First try: find elements whose textContent contains the match
  const clicked = await page.evaluate((text) => {
    // Try all common element types
    const allElements = document.querySelectorAll("s-button, button, [role='button'], [onclick]");
    for (const el of allElements) {
      if (el.textContent?.includes(text)) {
        (el as HTMLElement).click();
        return true;
      }
    }
    // Broader search: any clickable element
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const htmlEl = node as HTMLElement;
      if (htmlEl.textContent?.includes(text) && htmlEl.onclick) {
        htmlEl.click();
        return true;
      }
    }
    return false;
  }, textMatch);

  if (!clicked) {
    // Fallback: use Playwright's built-in locator with exact text
    await page.locator(`text="${textMatch}"`).first().click({ force: true });
  }
}

test.describe("Listing creation via test panel", () => {
  test("creates a listing when clicking a preset button", async ({ adminPage }) => {
    // The app should show the test panel heading
    await expect(adminPage.locator("text=Test Scenarios")).toBeVisible({ timeout: 15_000 });

    // Debug: log what elements contain "Dunk"
    const debugInfo = await adminPage.evaluate(() => {
      const results: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const el = node as HTMLElement;
        const text = el.textContent?.trim() ?? "";
        if (text.includes("Dunk") && !el.children.length) {
          results.push(`<${el.tagName.toLowerCase()} class="${el.className}"> "${text.slice(0, 80)}"`);
        }
      }
      return results.slice(0, 15);
    });
    console.log("Dunk elements:", JSON.stringify(debugInfo, null, 2));

    const countBefore = await countActiveListings();

    await clickPreset(adminPage, "Dunk Panda sz 9");
    await adminPage.waitForTimeout(5000);

    const countAfter = await countActiveListings();
    expect(countAfter).toBe(countBefore + 1);
  });
});
