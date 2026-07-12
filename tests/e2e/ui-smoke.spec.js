const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher, loginDriver } = require("./helpers.js");

test.describe("UI smoke", () => {
  test("login screen loads", async ({ page }) => {
    await page.goto("/?mode=demo");
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#login-logo")).toContainText("BusCommand");
    await expect(page.locator("#login-logo")).not.toContainText("FleetPulse");
    await expect(page.locator("#login-logo")).not.toContainText("Pulse");
  });

  test("quick demo dispatcher", async ({ page }) => {
    await page.goto("/?demo=dispatcher", { waitUntil: "networkidle" });
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#login-screen")).toBeHidden();
  });

  test("company admin email login", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/?mode=demo");
    await page.locator("#tab-dispatcher-btn").click();
    await page.locator("#login-dispatcher-email").fill("admin@demo.com");
    await page.locator("#login-dispatcher-password").fill("demo123");
    await page.locator("#dispatcher-login-btn").click();
    await expect(page.locator("#app-container")).toBeVisible();
  });

  test("driver PIN login", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/?mode=demo");
    await loginDriver(page);
    await expect(page.locator("#driver-dashboard")).toBeVisible();
  });

  test("SOS alarm flow", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/?mode=demo");
    await loginDriver(page);
    await page.evaluate(() => {
      const modal = document.getElementById("global-confirm-modal");
      if (modal && !modal.classList.contains("hidden") && typeof closeConfirmModal === "function") {
        closeConfirmModal();
      }
    });
    await page.evaluate(() => triggerSOSAlert());
    await expect(page.locator("#sos-trigger-modal")).toBeVisible();
    await page.evaluate(() => confirmSOSTrigger());
    await expect(page.locator("#driver-sos-banner")).toBeVisible();
    await page.evaluate(() => {
      if (window.state) {
        return window.state.sosActive === true;
      }
      return false;
    }).then((active) => expect(active).toBe(true));
  });

  test("dispatcher assigns shift", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/?mode=demo");
    await loginDispatcher(page);
    await page.evaluate(() => window.switchSection("dispatcher-shifts"));
    await expect(page.locator("#dispatcher-shifts")).toBeVisible();
    await page.locator("#shift-driver-select").selectOption("E2E Driver");
    const today = new Date().toISOString().slice(0, 10);
    await page.locator("#shift-date-input").fill(today);
    await page.locator("#shift-type-select").selectOption({ index: 1 });
    await page.locator("#shift-name-input").fill("310.E2E");
    await page.getByRole("button", { name: /Assign Shift/i }).click();
    const shiftCount = await page.evaluate(() => {
      const today = new Date().toISOString().slice(0, 10);
      return (window.state.shifts || []).filter(
        (s) => s.driverName === "E2E Driver" && s.date === today
      ).length;
    });
    expect(shiftCount).toBeGreaterThan(0);
  });
});
