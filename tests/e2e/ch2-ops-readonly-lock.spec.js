const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * Gate E — Chapter 2:
 * CA operational view is read-only (happy view + fail write).
 * First-writer lock engine is covered by unit tests (plan-edit-lock.test.mjs).
 */
test.describe("CA operational read-only (chapter 2)", () => {
  test("company admin can view group hub but cannot mutate buses", async ({ page }) => {
    await seedDemoState(page, {
      ...minimalDemoState(),
      buses: [{ id: "bus-1", number: "100", groupId: "101", active: true }]
    });
    await page.goto("/staff.html");
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");

    await page.locator('[data-action="openCompanyOpsOverview"]').click();
    await expect(page.locator("#dispatcher-group-hub")).not.toHaveClass(/hidden/);
    await expect(page.locator("#ops-readonly-banner")).toBeVisible();

    await page.evaluate(() => (window.openVehiclesForGroup || window.openGroupHub)("101"));
    await expect(page.locator("#dispatcher-vehicles")).toBeVisible();
    await expect(page.locator("#add-bus-form")).toBeHidden();
    await expect(page.locator(".vehicles-bus-import")).toBeHidden();
    await expect(page.locator("#settings-buses-list")).toContainText("100");

    const blocked = await page.evaluate(async () => {
      const before = (window.state.buses || []).length;
      const input = document.getElementById("new-bus-num");
      if (input) input.value = "99999";
      if (typeof window.addBus === "function") {
        await window.addBus({ preventDefault() {} });
      }
      return (window.state.buses || []).length === before;
    });
    expect(blocked).toBe(true);
  });
});
