const { test, expect } = require("@playwright/test");
const { seedDemoState, loginSuperAdmin, minimalDemoState } = require("./helpers.js");

async function openFirstCompanyRowMenu(page) {
  const row = page.locator("#superadmin-companies-list .sa-company-row").first();
  await row.locator(".row-actions-trigger").click();
  await expect(page.locator("body > .row-actions-menu:not([hidden])").first()).toBeVisible({ timeout: 5000 });
  return row;
}

test.describe("Super Admin demo", () => {
  test.beforeEach(async ({ page }) => {
    await seedDemoState(page, minimalDemoState());
  });

  test("dashboard shows aligned company columns and live stats", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await expect(page.locator("#superadmin-total-companies")).toHaveText("1");
    const userCount = Number(await page.locator("#superadmin-total-users").textContent());
    expect(userCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#superadmin-total-dispatchers")).toHaveText("1");

    const row = page.locator("#superadmin-companies-list .sa-company-row").first();
    await expect(row.locator(".sa-col-name")).toContainText("QA Dispatcher");
    await expect(row.locator(".sa-col-tenant")).toContainText("qa-local");
    // Unique license badge: TRIAL shows remaining days (yellow), not contradictory PRO/Paid chips.
    await expect(row.locator(".sa-col-status .badge")).toContainText(/Trial|Probni|Testphase|\d+/i);
    await expect(row.locator(".sa-col-country")).toContainText("DE");
    // Admin column shows Company Admin (not Dispo login email).
    await expect(row.locator(".sa-col-admin")).toContainText("ca@qa.local");
    await expect(row.locator('[data-action="superadminOpenCompanyDetail"]')).toBeVisible();
  });

  test("company detail hydrates from demo dispatcher state", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first().click();
    await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
    await expect(page.locator("#sa-detail-name")).toHaveText("QA Dispatcher");
    await expect(page.locator("#sa-detail-company-id")).toHaveText("qa-local");
    await expect(page.locator("#sa-detail-email")).toHaveText("dispo@qa.local");
    await expect(page.locator("#sa-detail-admins")).toContainText("QA Company Admin");
  });

  test("register company updates dashboard stats", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await page.locator('[data-action="superadminOpenCreateModal"]').click();
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();
    await page.locator("#sa-new-name").fill("Second Co");
    await page.locator("#sa-ca-name").fill("Second Admin");
    await page.locator("#sa-ca-email").fill("second-ca@qa.local");
    await page.locator("#sa-ca-password").fill("Qa-test-ok-9");
    await page.locator("#sa-create-company-btn").click();
    await expect(page.locator("#superadmin-total-companies")).toHaveText("2");
  });

  test("5x logo modal accepts demo SA email+password", async ({ page }) => {
    await page.goto("/staff.html");
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        if (typeof window.handleLogoClick === "function") window.handleLogoClick();
      }
    });
    await expect(page.locator("#superadmin-pin-modal")).toBeVisible();

    await page.locator("#superadmin-email-input").fill("sa@qa.local");
    await page.locator("#superadmin-pass-input").fill("Qa-test-ok-9");
    await page.locator('[data-action="confirmSuperAdminPin"]').click();

    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/);
    await expect(page.locator("#superadmin-dashboard")).not.toHaveClass(/hidden/);
  });

  test("suspend then activate company locally", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    const row = await openFirstCompanyRowMenu(page);
    // Menu is portaled to document.body — click the visible item only.
    await page.locator('.row-actions-item[data-action="superadminToggleStatus"]:visible').click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect(row.locator(".sa-col-status .badge")).toContainText(/Suspend|Suspendovan|Gesperrt/i);

    await openFirstCompanyRowMenu(page);
    await page.locator('.row-actions-item[data-action="superadminToggleStatus"]:visible').click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect(row.locator(".sa-col-status .badge")).toContainText(/Trial|Probni|Testphase|\d+|PRO|STARTER|ACTIVE/i);
  });

  test("typed company-id delete removes demo company", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await page.locator('[data-action="superadminOpenCreateModal"]').click();
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();
    await page.locator("#sa-new-name").fill("Temp Co");
    await page.locator("#sa-new-tenant").fill("temp-co");
    await page.locator("#sa-ca-name").fill("Temp Admin");
    await page.locator("#sa-ca-email").fill("temp-ca@qa.local");
    await page.locator("#sa-ca-password").fill("Qa-test-ok-9");
    await page.locator("#sa-create-company-btn").click();
    await expect(page.locator("#superadmin-total-companies")).toHaveText("2");

    const tempRow = page.locator('#superadmin-companies-list .sa-company-row[data-company-id="temp-co"]');
    await tempRow.locator(".row-actions-trigger").click();
    // Menu is portaled to document.body — click the visible Delete item.
    await page.locator('.row-actions-item[data-action="superadminDeleteCompany"]:visible').click();
    await expect(page.locator("#sa-delete-company-modal")).toBeVisible();
    await page.locator("#sa-delete-company-confirm").fill("temp-co");
    await page.locator('[data-action="superadminConfirmDeleteCompany"]').click();

    await expect(page.locator("#superadmin-total-companies")).toHaveText("1");
    await expect(page.locator("#superadmin-companies-list")).not.toContainText("Temp Co");
  });
});
