const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * Gate E — cross-group bus soft warning (assign still succeeds).
 */
test.describe("Cross-group bus conflict warn", () => {
  test("warn: assigning shared bus already active in other group shows toast but saves", async ({ page }) => {
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
      drivers: [
        {
          id: "drv-310",
          name: "Driver 310",
          pin: "1234",
          bus: "",
          groupId: "310",
          lineId: "310",
          active: true
        },
        {
          id: "drv-320",
          name: "Driver 320",
          pin: "1234",
          bus: "",
          groupId: "320",
          lineId: "320",
          active: true
        }
      ],
      buses: [
        {
          id: "bus-shared",
          number: "91504",
          groupId: "310",
          groupIds: ["310", "320"],
          active: true
        }
      ],
      shifts: [
        {
          id: "shf-310",
          driverId: "drv-310",
          driverName: "Driver 310",
          date: "2026-08-02",
          type: "morning",
          name: "Früh",
          bus: "91504",
          groupId: "310",
          start: "06:00",
          end: "14:00",
          revision: 1
        }
      ]
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    const saved = await page.evaluate(async () => {
      const driver = window.state.drivers.find((d) => d.id === "drv-320");
      const ok = await window.persistShift(driver, "2026-08-02", "morning", "Spät", "06:30", "14:30", "91504");
      const shift = (window.state.shifts || []).find(
        (s) => s.driverId === "drv-320" && s.date === "2026-08-02"
      );
      return { ok, bus: shift?.bus || null };
    });
    expect(saved.ok).toBe(true);
    expect(saved.bus).toBe("91504");

    await expect(page.locator("#toast-container .toast")).toContainText(/91504/);
    await expect(page.locator("#toast-container .toast")).toContainText(/310/);
  });

  test("happy: assigning bus with no other-group duty does not warn", async ({ page }) => {
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
      drivers: [
        {
          id: "drv-320",
          name: "Driver 320",
          pin: "1234",
          bus: "",
          groupId: "320",
          lineId: "320",
          active: true
        }
      ],
      buses: [{ id: "bus-1", number: "91504", groupId: "320", groupIds: ["320"], active: true }],
      shifts: []
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(async () => {
      const driver = window.state.drivers.find((d) => d.id === "drv-320");
      await window.persistShift(driver, "2026-08-02", "morning", "Spät", "06:30", "14:30", "91504");
    });

    await expect(page.locator("#toast-container .toast")).toHaveCount(0);
  });
});
