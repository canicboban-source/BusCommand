const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");

/** Faza 0.5 — smoke tok za Liniju 310 / Group Hub */
test.describe("Line 310 / Group Hub", () => {
  test("dispatcher opens Group Hub for line 310", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();
    await expect(page.locator("#group-hub-title")).toHaveText("Line 101");
    await expect(page.locator("#group-hub-id-badge")).toHaveText("101");
    await expect(page.locator("#hub-stat-drivers")).not.toHaveText("0");
  });

  test("Group Hub navigates to daily plan and back", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();

    await page.getByRole("button", { name: /Daily plan|Dnevni plan/i }).first().click();
    await expect(page.locator("#dispatcher-daily-plan-full")).toBeVisible();

    await page.evaluate(() => window.backFromPlanFullPage());
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();
  });

  test("Group Hub shows import step for empty line", async ({ page }) => {
    // Dispo may only open assigned groups (Phase 1 scope). Fixture must grant 310.
    const base = require("./helpers.js").minimalDemoState();
    const emptyLineState = {
      ...base,
      groups: [{ id: "310", name: "310", color: "#2DD4BF", active: true, companyId: "qa-local" }],
      drivers: [],
      buses: [],
      activeGroupHubId: "310",
      dispatchers: (base.dispatchers || []).map((d) => (
        d.isSuperAdmin ? d : { ...d, groups: ["310"], activeGroupId: "310" }
      ))
    };
    await seedDemoState(page, emptyLineState);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("310"));
    await expect(page.locator("#dispatcher-group-hub")).toBeVisible();
    await expect(page.locator("#group-hub-empty-hint")).toBeVisible();
    await expect(page.locator("#group-hub-step-import")).toBeVisible();
  });
});
