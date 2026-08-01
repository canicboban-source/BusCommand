const { test, expect } = require("@playwright/test");

test("company detail uses the audited support flow and never opens a new tab", async ({ page }) => {
  await page.goto("/staff.html?mode=demo");

  await page.evaluate(() => window.superadminOpenCompanyDetail("tenant-qa"));

  await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
  const supportAction = page.locator("#sa-detail-support-action-btn");
  await expect(supportAction).toBeDisabled();
  await expect(supportAction).not.toHaveAttribute("data-action", /.+/);
  await expect(supportAction).toHaveAttribute("data-i18n", "sa_detail_support_off");

  const popup = page.waitForEvent("popup", { timeout: 750 }).catch(() => null);
  await supportAction.evaluate((button) => button.click());

  expect(await popup).toBeNull();
  await expect(page.locator("#sa-support-modal")).toBeHidden();
});
