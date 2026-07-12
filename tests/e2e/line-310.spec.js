const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");

/** Faza 0.5 — smoke tok za Liniju 310 / Group Hub */
test.describe("Line 310 / Group Hub", () => {
  test("dispatcher opens Group Hub for line 310", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("grp-1"));
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();
    await expect(page.locator("#group-hub-title")).toHaveText("310");
    await expect(page.locator("#group-hub-id-badge")).toHaveText("grp-1");
    await expect(page.locator("#hub-stat-drivers")).not.toHaveText("0");
  });

  test("Group Hub navigates to daily plan and back", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("grp-1"));
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();

    await page.getByRole("button", { name: /Daily plan|Dnevni plan/i }).first().click();
    await expect(page.locator("#dispatcher-daily-plan-full")).toBeVisible();

    await page.evaluate(() => window.backFromPlanFullPage());
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();
  });

  test("Group Hub shows import step for empty line", async ({ page }) => {
    const emptyLineState = {
      ...(require("./helpers.js").minimalDemoState()),
      groups: [{ id: "310", name: "310", color: "#2DD4BF", active: true, companyId: "demo" }],
      drivers: [],
      buses: []
    };
    await seedDemoState(page, emptyLineState);
    await page.goto("/?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("310"));
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();
    await expect(page.locator("#group-hub-empty-hint")).toBeVisible();
    await expect(page.locator("#group-hub-step-import")).toBeVisible();
  });
});
