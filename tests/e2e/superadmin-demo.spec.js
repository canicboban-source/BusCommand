const { test, expect } = require("@playwright/test");
const { seedDemoState, loginSuperAdmin, minimalDemoState } = require("./helpers.js");

test.describe("Super Admin demo", () => {
  test.beforeEach(async ({ page }) => {
    await seedDemoState(page, minimalDemoState());
  });

  test("dashboard shows aligned company columns and live stats", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await expect(page.locator("#superadmin-total-companies")).toHaveText("1");
    // Demo baseline may seed VOR 320 crew (5) on top of the fixture driver.
    const userCount = Number(await page.locator("#superadmin-total-users").textContent());
    expect(userCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#superadmin-total-dispatchers")).toHaveText("1");

    const card = page.locator("#superadmin-companies-list .sa-company-card").first();
    await expect(card.locator(".sa-company-card-name")).toContainText("QA Dispatcher");
    await expect(card.locator(".sa-company-id-code")).toContainText("qa-local");
    await expect(card.locator(".sa-company-card-status")).toContainText("active");
    await expect(card).toContainText("trial");
    await expect(card).toContainText("DE");
    await expect(card).toContainText("dispo@qa.local");
    await expect(card.locator('[data-action="superadminToggleStatus"]')).toBeVisible();
    await expect(card.locator('[data-action="superadminStartSupport"]')).toBeVisible();
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

    await page.locator("#sa-new-name").fill("Alpine Transit");
    await page.locator("#sa-new-pin").fill("4321");
    await page.locator("#sa-create-company-btn").click();

    await expect(page.locator("#superadmin-total-companies")).toHaveText("2");
    await expect(page.locator("#superadmin-companies-list")).toContainText("Alpine Transit");
    await expect(page.locator("#superadmin-companies-list")).toContainText("alpine-transit");
  });

  test("5x logo modal accepts demo SA email+password", async ({ page }) => {
    await page.goto("/staff.html");
    await page.locator("#tab-dispatcher-btn").click().catch(() => {});

    await page.evaluate(() => {
      const logo = document.getElementById("login-logo");
      for (let i = 0; i < 5; i++) {
        logo.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
    });

    await expect(page.locator("#superadmin-pin-modal")).toBeVisible();
    await expect(page.locator("#superadmin-prod-fields")).toBeVisible();
    await expect(page.locator("#superadmin-demo-fields")).toBeHidden();

    await page.locator("#superadmin-email-input").fill("sa@qa.local");
    await page.locator("#superadmin-pass-input").fill("Qa-test-ok-9");
    await page.locator('[data-action="confirmSuperAdminPin"]').click();

    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/);
    await expect(page.locator("#superadmin-dashboard")).not.toHaveClass(/hidden/);
  });

  test("suspend then activate company locally", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await page.locator('#superadmin-companies-list [data-action="superadminToggleStatus"]').first().click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator("#superadmin-companies-list .sa-company-card").first().locator(".sa-company-card-status")).toContainText("suspended");

    await page.locator('#superadmin-companies-list [data-action="superadminToggleStatus"]').first().click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator("#superadmin-companies-list .sa-company-card").first().locator(".sa-company-card-status")).toContainText("active");
  });

  test("typed company-id delete removes demo company", async ({ page }) => {
    await page.goto("/staff.html");
    await loginSuperAdmin(page);

    await page.locator("#sa-new-name").fill("Temp Co");
    await page.locator("#sa-new-pin").fill("9999");
    await page.locator("#sa-create-company-btn").click();
    await expect(page.locator("#superadmin-total-companies")).toHaveText("2");

    await page.locator('#superadmin-companies-list [data-action="superadminDeleteCompany"]').filter({ hasText: /Delete|Obriši/i }).last().click();
    await expect(page.locator("#sa-delete-company-modal")).toBeVisible();
    await page.locator("#sa-delete-company-confirm").fill("temp-co");
    await page.locator('[data-action="superadminConfirmDeleteCompany"]').click();

    await expect(page.locator("#superadmin-total-companies")).toHaveText("1");
    await expect(page.locator("#superadmin-companies-list")).not.toContainText("Temp Co");
  });
});
