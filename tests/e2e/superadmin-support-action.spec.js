const { test, expect } = require("@playwright/test");

test("company detail exposes Edit as the primary action and keeps Support separate", async ({ page }) => {
  await page.goto("/staff.html?mode=demo");

  await page.evaluate(() => window.superadminOpenCompanyDetail("tenant-qa"));

  await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
  const editAction = page.locator("#sa-detail-edit-btn");
  const supportAction = page.locator("#sa-detail-support-action-btn");
  await expect(editAction).toBeEnabled();
  await expect(editAction).toHaveAttribute("data-action", "superadminEditCompanyDetail");
  await expect(supportAction).toBeDisabled();
  await expect(supportAction).not.toHaveAttribute("data-action", /.+/);
  await expect(supportAction).toHaveAttribute("data-i18n", "sa_detail_support_off");

  const popup = page.waitForEvent("popup", { timeout: 750 }).catch(() => null);
  await editAction.click();

  expect(await popup).toBeNull();
  await expect(page.locator("#sa-company-detail-edit-form")).toBeVisible();
  await expect(page.locator("#sa-edit-company-name")).toHaveValue("tenant-qa");
  await expect(supportAction).toHaveClass(/hidden/);
  await expect(editAction).toHaveAttribute("data-action", "superadminSaveCompanyDetail");

  await page.locator("#sa-edit-company-name").fill("Tenant QA Transit");
  await editAction.click();
  await expect(page.locator("#sa-company-detail-edit-form")).toBeHidden();
  await expect(page.locator("#sa-detail-name")).toHaveText("Tenant QA Transit");
  await expect(supportAction).not.toHaveClass(/hidden/);
  await expect(supportAction).toBeDisabled();
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


