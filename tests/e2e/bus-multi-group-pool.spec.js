const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * Gate E — same bus number in multiple groups (company pool).
 * Happy: attach 91504 from 310 → 320 (one record).
 * Fail: empty paste does not invent buses / attach.
 */
test.describe("Bus multi-group pool", () => {
  test("happy: import existing company bus into second group attaches once", async ({ page }) => {
    const state = {
      ...minimalDemoState(),
      groups: [
        { id: "310", name: "Line 310", color: "#3D7EF5", active: true, companyId: "demo" },
        { id: "320", name: "Line 320", color: "#16a34a", active: true, companyId: "demo" }
      ],
      dispatchers: [
        {
          id: "dispo-1",
          name: "Demo Dispatcher",
          email: "demo@buscommand.com",
          password: "demo123",
          passwordChanged: true,
          groups: ["310", "320"],
          companyId: "demo"
        }
      ],
      buses: [
        {
          id: "bus-shared",
          number: "91504",
          groupId: "310",
          lineId: "310",
          groupIds: ["310"],
          active: true
        }
      ]
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => (window.openVehiclesForGroup || window.openGroupHub)("320"));
    await expect(page.locator("#dispatcher-vehicles")).toBeVisible();
    await expect(page.locator("#settings-buses-list")).not.toContainText("91504");

    await page.locator("#bus-import-paste").fill("91504\n");
    await page.locator('[data-action="handleBusImportPaste"]').click();
    await expect(page.locator("#bus-import-preview")).toContainText(/Link|verknüpfen|Poveži/i);

    await page.locator('[data-action="confirmBusImport"]').click();
    const confirmBtn = page
      .locator("#global-confirm-modal [data-action='confirmModalYes'], #global-confirm-modal button.btn-primary")
      .first();
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await expect(page.locator("#settings-buses-list")).toContainText("91504");

    const pool = await page.evaluate(() => {
      const buses = window.state.buses.filter((b) => String(b.number) === "91504");
      return {
        count: buses.length,
        groups: buses[0]?.groupIds || []
      };
    });
    expect(pool.count).toBe(1);
    expect(pool.groups).toEqual(expect.arrayContaining(["310", "320"]));
  });

  test("fail: empty paste does not attach or create", async ({ page }) => {
    const state = {
      ...minimalDemoState(),
      groups: [
        { id: "310", name: "Line 310", color: "#3D7EF5", active: true, companyId: "demo" },
        { id: "320", name: "Line 320", color: "#16a34a", active: true, companyId: "demo" }
      ],
      dispatchers: [
        {
          id: "dispo-1",
          name: "Demo Dispatcher",
          email: "demo@buscommand.com",
          password: "demo123",
          passwordChanged: true,
          groups: ["310", "320"],
          companyId: "demo"
        }
      ],
      buses: [
        {
          id: "bus-shared",
          number: "91504",
          groupId: "310",
          groupIds: ["310"],
          active: true
        }
      ]
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);
    await page.evaluate(() => (window.openVehiclesForGroup || window.openGroupHub)("320"));

    await page.locator("#bus-import-paste").fill("  \n");
    await page.locator('[data-action="handleBusImportPaste"]').click();
    await expect(page.locator("#bus-import-preview")).toBeEmpty();
    await expect(page.locator("#settings-buses-list li")).toHaveCount(0);

    const stillOneGroup = await page.evaluate(() => {
      const bus = window.state.buses.find((b) => b.number === "91504");
      return bus?.groupIds || [bus?.groupId];
    });
    expect(stillOneGroup).toEqual(["310"]);
  });
});
