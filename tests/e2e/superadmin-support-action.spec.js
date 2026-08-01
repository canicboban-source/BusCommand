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

test("support start allows only one in-flight submission", async ({ page }) => {
  await page.goto("/staff.html?mode=demo");

  await page.evaluate(() => {
    window.__supportStartCalls = 0;
    window.ApiClient.startSupportSession = async () => {
      window.__supportStartCalls += 1;
      await new Promise((resolve) => { window.__resolveSupportStart = resolve; });
      return { success: false, error: "Controlled test response" };
    };
    window.superadminStartSupport("tenant-qa");
  });

  await page.locator("#sa-support-reason").fill("Valid audited support reason for the controlled test.");
  const confirm = page.locator("#sa-support-confirm-btn");
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveAttribute("aria-busy", "true");
  await confirm.evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__supportStartCalls)).toBe(1);

  await page.evaluate(() => window.__resolveSupportStart());
  await expect(confirm).toBeEnabled();
  await expect(confirm).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#sa-support-error")).toContainText("Controlled test response");
});
