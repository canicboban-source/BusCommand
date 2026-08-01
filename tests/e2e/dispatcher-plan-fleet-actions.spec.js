const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function currentWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return [monday.getFullYear(), String(monday.getMonth() + 1).padStart(2, "0"), String(monday.getDate()).padStart(2, "0")].join("-");
}

test.describe("dispatcher plan and fleet actions", () => {
  test("daily and monthly group cards open their full plans", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.switchSection("dispatcher-daily-plan-pick"));
    await page.locator("#daily-plan-groups-grid .dashboard-group-card").first().click();
    await expect(page.locator("#dispatcher-daily-plan-full")).toBeVisible();

    await page.evaluate(() => window.switchSection("dispatcher-monthly-plan-pick"));
    await page.locator("#monthly-plan-groups-grid .dashboard-group-card").first().click();
    await expect(page.locator("#dispatcher-monthly-plans-full")).toBeVisible();
  });

  test("dispatcher edits a bus number inside the active group", async ({ page }) => {
    const state = minimalDemoState();
    state.buses = [{ id: "bus-1", number: "91504", groupId: "101", lineId: "101", active: true }];
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    const row = page.locator("#settings-buses-list li").filter({ hasText: "91504" });
    await row.getByRole("button", { name: /Edit|Uredi|Bearbeiten/i }).click();
    await row.locator('input[name="number"]').fill("91505");
    await row.getByRole("button", { name: /Save|Sačuvaj|Speichern/i }).click();

    await expect(page.locator("#settings-buses-list")).toContainText("91505");
    await expect(page.locator("#settings-buses-list")).not.toContainText("91504");
  });

  test("one weekly delete removes canonical and legacy copies and the monthly mirror", async ({ page }) => {
    const date = currentWeekMonday();
    const state = minimalDemoState();
    state.drivers[0].active = true;
    state.shifts = [
      { id: "legacy", driverName: "E2E Driver", date, type: "morning", name: "Legacy", revision: 1 },
      { id: "canonical", driverId: "drv-e2e", date, type: "night", name: "Canonical", revision: 2 }
    ];
    state.schedules = [{
      id: `drv-e2e_${date.slice(0, 7)}`,
      driverId: "drv-e2e",
      driverName: "E2E Driver",
      month: date.slice(0, 7),
      parsedShifts: { [Number(date.slice(8, 10))]: { type: "night", name: "Canonical" } }
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.switchSection("dispatcher-shifts"));
    await page.locator("#shifts-weekly-grid button[title]").first().click();

    await expect(page.locator("#shifts-weekly-grid button[title]")).toHaveCount(0);
    const saved = await page.evaluate((targetDate) => ({
      shifts: window.state.shifts,
      mirrored: window.state.schedules[0].parsedShifts[Number(targetDate.slice(8, 10))]
    }), date);
    expect(saved.shifts).toEqual([]);
    expect(saved.mirrored).toBeUndefined();
  });
});
