const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * Gate E — lock polish: banner claim/release (happy) + second writer blocked (fail).
 */
test.describe("Plan edit lock banner (demo)", () => {
  test("dispatcher claims and releases day lock from daily plan banner", async ({ page }) => {
    await seedDemoState(page, {
      ...minimalDemoState(),
      drivers: [
        {
          id: "drv-e2e",
          name: "E2E Driver",
          pin: "1234",
          bus: "101",
          groupId: "101",
          lineId: "101",
          active: true
        }
      ],
      shiftCatalogs: {
        "101": {
          groupId: "101",
          shifts: [
            { code: "A1", type: "morning", start: "05:00", end: "13:00", shortName: "A1" }
          ]
        }
      }
    });
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (typeof window.openDailyPlanFull === "function") window.openDailyPlanFull();
    });
    await expect(page.locator("#dispatcher-daily-plan-full")).not.toHaveClass(/hidden/);
    await expect(page.locator("#plan-edit-lock-banner")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-action="acquirePlanEditLock"]')).toBeVisible();

    await page.locator('[data-action="acquirePlanEditLock"]').click();
    await expect(page.locator('[data-action="releasePlanEditLock"]')).toBeVisible();
    await expect(page.locator("#plan-edit-lock-banner")).toContainText(/hold|Sperre|lock/i);

    await page.locator('[data-action="releasePlanEditLock"]').click();
    await expect(page.locator('[data-action="acquirePlanEditLock"]')).toBeVisible();
  });

  test("second demo identity cannot acquire held lock", async ({ page }) => {
    await seedDemoState(page, minimalDemoState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    const blocked = await page.evaluate(() => {
      const key = "buscommand_plan_locks_v1";
      const lockId = "day:101:2026-08-02";
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      const todayId = `day:101:${y}-${m}-${d}`;
      const store = {
        [todayId]: {
          lockId: todayId,
          holderUid: "other-dispo",
          holderName: "Other",
          acquiredAtMs: Date.now(),
          expiresAtMs: Date.now() + 20 * 60 * 1000,
          updatedAtMs: Date.now()
        }
      };
      localStorage.setItem(key, JSON.stringify(store));
      window.state.activeGroupHubId = "101";
      if (typeof window.openDailyPlanFull === "function") window.openDailyPlanFull();
      return todayId !== lockId ? todayId : lockId;
    });
    expect(blocked).toMatch(/^day:101:\d{4}-\d{2}-\d{2}$/);

    await expect(page.locator("#plan-edit-lock-banner")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#plan-edit-lock-banner")).toContainText(/Other|locked|gesperrt|zaključao/i);
    await expect(page.locator('[data-action="releasePlanEditLock"]')).toHaveCount(0);
    await expect(page.locator('[data-action="acquirePlanEditLock"]')).toHaveCount(0);
  });
});
