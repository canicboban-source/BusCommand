const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * Pre-commit smoke (gate E): dispatcher bus import happy + fail paths.
 * Tok: UI paste → preview → confirm → lista; fail: prazan uvoz.
 */
test.describe("Dispatcher bus import smoke", () => {
  test("happy: paste preview confirm adds buses to group hub", async ({ page }) => {
    const state = {
      ...minimalDemoState(),
      buses: [
        { id: "bus-old", number: "90001", groupId: "101", lineId: "101", active: true }
      ]
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => {
      const fn = window.openGroupHub;
      if (typeof fn !== "function") throw new Error("openGroupHub missing");
      fn("101");
    });

    await expect(page.locator("#hub-section-buses")).toBeVisible();
    await page.locator("#bus-import-paste").fill("91103\n91104\n90001\n");
    await page.locator('[data-action="handleBusImportPaste"]').click();

    await expect(page.locator("#bus-import-preview")).toContainText(/New|Novi|Neu/i);
    await expect(page.locator("#bus-import-preview")).toContainText("2");

    await page.locator('[data-action="confirmBusImport"]').click();
    const confirmBtn = page.locator("#global-confirm-modal [data-action='confirmModalYes'], #global-confirm-modal button.btn-primary").first();
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await expect(page.locator("#settings-buses-list")).toContainText("91103");
    await expect(page.locator("#settings-buses-list")).toContainText("91104");
    await expect(page.locator("#settings-buses-list")).toContainText("90001");
  });

  test("fail: empty paste shows error and does not invent buses", async ({ page }) => {
    await seedDemoState(page, minimalDemoState());
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    await page.locator("#bus-import-paste").fill("   \n  ");
    await page.locator('[data-action="handleBusImportPaste"]').click();

    await expect(page.locator("#bus-import-preview")).toBeEmpty();
    // Toast or no preview — must not create list items from empty input
    await expect(page.locator("#settings-buses-list li")).toHaveCount(0);
  });
});
