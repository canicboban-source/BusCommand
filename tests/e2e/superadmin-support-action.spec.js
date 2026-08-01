const { test, expect } = require("@playwright/test");

test("company detail uses the audited support flow and never opens a new tab", async ({ page }) => {
  await page.goto("/staff.html?mode=demo");

  await page.evaluate(() => {
    window.ApiClient.getAdminCompanyDetails = async (companyId) => ({
      success: true,
      company: {
        id: companyId,
        name: "Isolated QA tenant",
        status: "active",
        plan: "trial",
        country: "AT",
        contactEmail: "qa@example.invalid",
        trialEndsAt: "2026-08-31T12:00:00.000Z",
        supportSessionEnabled: true,
        supportSessionActive: false,
        counts: { companyAdmins: 1, dispatchers: 1, drivers: 2, groups: 1 },
        companyAdmins: []
      }
    });
  });

  await page.evaluate(() => window.superadminOpenCompanyDetail("tenant-qa"));

  await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
  const supportAction = page.locator("#sa-detail-support-action-btn");
  await expect(supportAction).toBeEnabled();
  await expect(supportAction).toHaveAttribute("data-action", "superadminStartSupport");
  await expect(supportAction).toHaveAttribute("data-i18n", "sa_support_start");

  const popup = page.waitForEvent("popup", { timeout: 750 }).catch(() => null);
  await supportAction.click();

  expect(await popup).toBeNull();
  await expect(page.locator("#sa-support-modal")).toBeVisible();
  await expect(page.locator("#sa-support-reason")).toBeVisible();
});
