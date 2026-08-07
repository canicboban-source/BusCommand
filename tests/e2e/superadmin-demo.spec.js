const { test, expect } = require("@playwright/test");
const { seedDemoState, loginSuperAdmin, minimalDemoState } = require("./helpers.js");

test.describe("Super Admin demo", () => {
  test.beforeEach(async ({ page }) => {
    await seedDemoState(page, minimalDemoState());
  });

  test("dashboard shows aligned company columns and live stats", async ({ page }) => {
    await page.goto("/staff.html?mode=demo");
    await loginSuperAdmin(page);

    await expect(page.locator("#superadmin-total-companies")).toHaveText("1");
    // Demo baseline may seed VOR 320 crew (5) on top of the fixture driver.
    const userCount = Number(await page.locator("#superadmin-total-users").textContent());
    expect(userCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#superadmin-total-dispatchers")).toHaveText("1");

    const row = page.locator("#superadmin-companies-list tr").first();
    await expect(row.locator("td").nth(0)).toContainText("Demo Dispatcher");
    await expect(row.locator("td").nth(1)).toContainText("demo");
    await expect(row.locator("td").nth(2)).toContainText("active");
    await expect(row.locator("td").nth(3)).toContainText("trial");
    await expect(row.locator("td").nth(4)).toContainText("DE");
    await expect(row.locator("td").nth(5)).toContainText("demo@buscommand.com");
    await expect(row.locator('[data-action="superadminToggleStatus"]')).toBeVisible();
    await expect(row.locator('[data-action="superadminStartSupport"]')).toBeVisible();
  });

  test("company detail hydrates from demo dispatcher state", async ({ page }) => {
    await page.goto("/staff.html?mode=demo");
    await loginSuperAdmin(page);

    await page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first().click();
    await expect(page.locator("#sa-company-detail-modal")).toBeVisible();
    await expect(page.locator("#sa-detail-name")).toHaveText("Demo Dispatcher");
    await expect(page.locator("#sa-detail-company-id")).toHaveText("demo");
    await expect(page.locator("#sa-detail-email")).toHaveText("demo@buscommand.com");
    await expect(page.locator("#sa-detail-admins")).toContainText("Demo Admin");
  });

  test("register company updates dashboard stats", async ({ page }) => {
    await page.goto("/staff.html?mode=demo");
    await loginSuperAdmin(page);

    await page.locator("#sa-new-name").fill("Alpine Transit");
    await page.locator("#sa-new-pin").fill("4321");
    await page.locator("#sa-create-company-btn").click();

    await expect(page.locator("#superadmin-total-companies")).toHaveText("2");
    await expect(page.locator("#superadmin-companies-list")).toContainText("Alpine Transit");
    await expect(page.locator("#superadmin-companies-list")).toContainText("alpine-transit");
  });

  test("5x logo modal accepts demo SA email+password", async ({ page }) => {
    await page.goto("/staff.html?mode=demo");
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

    await page.locator("#superadmin-email-input").fill("sa@demo.local");
    await page.locator("#superadmin-pass-input").fill("sa-demo-ok");
    await page.locator('[data-action="confirmSuperAdminPin"]').click();

    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/);
    await expect(page.locator("#superadmin-dashboard")).not.toHaveClass(/hidden/);
  });

  test("suspend then activate company locally", async ({ page }) => {
    await page.goto("/staff.html?mode=demo");
    await loginSuperAdmin(page);

    await page.locator('#superadmin-companies-list [data-action="superadminToggleStatus"]').first().click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator("#superadmin-companies-list tr").first().locator("td").nth(2)).toContainText("suspended");

    await page.locator('#superadmin-companies-list [data-action="superadminToggleStatus"]').first().click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator("#superadmin-companies-list tr").first().locator("td").nth(2)).toContainText("active");
  });

  test("typed company-id delete removes demo company", async ({ page }) => {
    await page.goto("/staff.html?mode=demo");
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
