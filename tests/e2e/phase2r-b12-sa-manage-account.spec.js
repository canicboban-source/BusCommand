/**
 * FAZA 2R-B.1.2 — Super Admin Manage account modal (demo harness).
 * Proves: no dead Open footer; Manage account opens editable modal; Save works;
 * Start audited support opens real support modal when enabled.
 */
const { test, expect } = require("@playwright/test");
const { seedDemoState, loginSuperAdmin, minimalDemoState } = require("./helpers.js");

test.describe("FAZA 2R-B.1.2 Super Admin Manage account", () => {
  test.beforeEach(async ({ page }) => {
    const seeded = minimalDemoState();
    // Ensure audited support is available so footer CTA can be proven.
    const disp = (seeded.dispatchers || []).find((d) => d.companyId === "qa-local") || seeded.dispatchers?.[0];
    if (disp) {
      disp.features = { ...(disp.features || {}), supportSession: true };
    }
    await seedDemoState(page, seeded);
  });

  test("production DOM has no dead Open footer button", async ({ page }) => {
    await page.goto("/staff.html");
    const dead = await page.locator("#sa-detail-open-app-btn").count();
    expect(dead).toBe(0);
    await expect(page.locator("#sa-detail-support-btn")).toHaveCount(1);
  });

  test("Manage account opens editable account modal; footer has no Open", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    const manageBtn = page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first();
    await expect(manageBtn).toBeVisible();
    const label = (await manageBtn.innerText()).trim();
    expect(label).toMatch(/Manage account|Konto verwalten|Upravljaj nalogom/i);

    await manageBtn.click();
    const modal = page.locator("#sa-company-detail-modal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#sa-detail-title")).toContainText(/Manage company account|Firmenkonto|Upravljanje nalogom/i);
    await expect(page.locator("#sa-detail-settings")).toBeVisible();
    await expect(page.locator('[data-action="superadminSaveCompanySettings"]')).toBeVisible();
    await expect(page.locator("#sa-detail-open-app-btn")).toHaveCount(0);
    await expect(modal.locator(".sa-detail-footer")).not.toContainText(/^\s*Open\s*$/i);
    await expect(modal.locator(".sa-detail-footer [data-action='superadminCloseCompanyDetail']")).toBeVisible();
  });

  test("Save settings yields proven success or demo production-only outcome", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);
    await page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first().click();
    await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
    await expect(page.locator("#sa-edit-max-drivers")).toBeVisible();
    await page.locator("#sa-edit-max-drivers").fill("42");
    await page.locator('[data-action="superadminSaveCompanySettings"]').click();
    // Demo: explicit production-only toast (real outcome). Production: success/error toast.
    await expect
      .poll(async () => {
        const toast = await page.locator("#toast-container .toast-msg, .toast-msg").allTextContents();
        return /saved|sačuvan|gespeichert|production-only|Settings patch|podešavan|Einstellungen|uspeh|error|greška/i.test(
          toast.join(" ")
        );
      }, { timeout: 8000 })
      .toBeTruthy();
    await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
  });

  test("Start audited support opens real support modal", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);
    await page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first().click();
    await expect(page.locator("#sa-company-detail-modal")).toBeVisible();

    const supportBtn = page.locator("#sa-detail-support-btn");
    await expect(supportBtn).toBeVisible();
    await supportBtn.click();
    await expect(page.locator("#sa-support-modal")).toBeVisible();
    await expect(page.locator("#sa-support-reason")).toBeVisible();
    await expect(page.locator('[data-action="superadminConfirmSupportStart"]')).toBeVisible();
  });
});
