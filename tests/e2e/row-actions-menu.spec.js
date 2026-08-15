/**
 * Gate 3.0 — runtime row-actions: item click after open, Escape, outside, scroll cleanup.
 */
const { test, expect } = require("@playwright/test");
const { seedDemoState, loginSuperAdmin, minimalDemoState } = require("./helpers.js");

test.describe("Row actions menu behavior", () => {
  test.beforeEach(async ({ page }) => {
    await seedDemoState(page, minimalDemoState());
  });

  test("item click works immediately; Escape and outside close; scroll after grace cleans portal", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    const row = page.locator("#superadmin-companies-list .sa-company-row").first();
    await row.locator(".row-actions-trigger").click();
    const menu = page.locator("body > .row-actions-menu:not([hidden])").first();
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Immediate item interaction (within grace window)
    const suspend = page.locator('body > .row-actions-menu [data-action="superadminToggleStatus"]:visible').first();
    await expect(suspend).toBeVisible();
    await suspend.click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible({ timeout: 5000 });
    // Cancel without suspending — prove item was actionable.
    await page.locator('#global-confirm-modal [data-action="closeConfirmModal"]').click();
    await expect(page.locator("#global-confirm-modal")).toBeHidden({ timeout: 5000 });
    await page.waitForTimeout(200);

    // Re-open → Escape
    await row.locator(".row-actions-trigger").click();
    await expect(page.locator("body > .row-actions-menu:not([hidden])").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("body > .row-actions-menu:not([hidden])")).toHaveCount(0);

    // Re-open → outside click (no grace on outside)
    await row.locator(".row-actions-trigger").click();
    await expect(page.locator("body > .row-actions-menu:not([hidden])").first()).toBeVisible();
    await page.locator("#superadmin-dashboard h2").click({ position: { x: 8, y: 8 } });
    await expect(page.locator("body > .row-actions-menu:not([hidden])")).toHaveCount(0);

    // Re-open → scroll after grace restores (no orphan)
    await row.locator(".row-actions-trigger").click();
    await expect(page.locator("body > .row-actions-menu:not([hidden])").first()).toBeVisible();
    await page.waitForTimeout(180);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("scroll", { bubbles: true }));
      document.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect.poll(async () => page.locator("body > .row-actions-menu:not([hidden])").count()).toBe(0);
  });
});
