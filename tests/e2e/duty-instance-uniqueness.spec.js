const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dutyConflictState() {
  const date = todayIso();
  return {
    ...minimalDemoState(),
    drivers: [
      {
        id: "drv-dusan",
        name: "Dušan Popović",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "",
        email: "dusan@example.test",
        phone: "+4310000001"
      },
      {
        id: "drv-aleksandar",
        name: "Aleksandar Nikolić",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "",
        email: "aleksandar@example.test",
        phone: "+4310000002"
      }
    ],
    buses: [
      { id: "bus-1", number: "BUS-1", groupId: "101", lineId: "101", active: true }
    ],
    shifts: [
      {
        id: `shf-dusan-${date}`,
        driverId: "drv-dusan",
        driverName: "Dušan Popović",
        date,
        type: "morning",
        name: "101.S01",
        routeCode: "101.S01",
        bus: "",
        start: "05:15",
        end: "13:15",
        revision: 1
      }
    ],
    reports: []
  };
}

test.describe("P1 Duty Instance Uniqueness & Conflict Modal", () => {
  test("duplicate duty assignment triggers persistent conflict modal with no override action", async ({ page }) => {
    const date = todayIso();
    const state = dutyConflictState();
    await seedDemoState(page, state);
    await loginDispatcher(page);

    await page.evaluate((d) => {
      window.showDutyConflictModal({
        dutyCode: "101.S01",
        date: d,
        existingDriverName: "Dušan Popović",
        existingDriverId: "drv-dusan"
      });
    }, date);

    const modal = page.locator("#duty-conflict-modal");
    await expect(modal).toBeVisible();

    const title = page.locator("#duty-conflict-title");
    await expect(title).toBeVisible();

    const msg = page.locator("#duty-conflict-message");
    await expect(msg).toContainText("101.S01");
    await expect(msg).toContainText("Dušan Popović");

    const overrideBtn = modal.locator("button:has-text('Override'), button:has-text('Force'), button:has-text('Preuzmi'), button:has-text('Zameni')");
    await expect(overrideBtn).toHaveCount(0);

    const showDriverBtn = page.locator("#duty-conflict-open-existing-btn");
    await expect(showDriverBtn).toBeVisible();
    await expect(showDriverBtn).toContainText("Dušan Popović");

    const closeBtn = page.locator("#duty-conflict-close-btn");
    await expect(closeBtn).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("clicking 'Prikaži vozača' closes modal and opens conflicting driver cell", async ({ page }) => {
    const date = todayIso();
    const state = dutyConflictState();
    await seedDemoState(page, state);
    await loginDispatcher(page);

    await page.evaluate(({ d }) => {
      window.showDutyConflictModal({
        dutyCode: "101.S01",
        date: d,
        existingDriverName: "Dušan Popović",
        existingDriverId: "drv-dusan"
      });
    }, { d: date });

    const modal = page.locator("#duty-conflict-modal");
    await expect(modal).toBeVisible();

    const showDriverBtn = page.locator("#duty-conflict-open-existing-btn");
    await expect(showDriverBtn).toBeVisible();
    await showDriverBtn.click();

    await expect(modal).not.toBeVisible();
  });
});
