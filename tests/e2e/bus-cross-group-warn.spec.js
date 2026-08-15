const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * FAZA 3 — cross-group / overlapping bus is a hard block (never warn-but-save).
 */
test.describe("Bus overlap hard block", () => {
  test("block: assigning shared bus already active shows error and does not save", async ({ page }) => {
    const state = {
      ...minimalDemoState(),
      groups: [
        { id: "310", name: "Line 310", color: "#3D7EF5", active: true, companyId: "qa-local" },
        { id: "320", name: "Line 320", color: "#16a34a", active: true, companyId: "qa-local" }
      ],
      dispatchers: [
        {
          id: "dispo-1",
          name: "Demo Dispatcher",
          email: "dispo@qa.local",
          password: "Qa-test-ok-9",
          passwordChanged: true,
          groups: ["310", "320"],
          companyId: "qa-local"
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
          active: true,
          opsStatus: "active"
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
    await page.goto("/staff.html");
    await loginDispatcher(page);

    const saved = await page.evaluate(async () => {
      const driver = window.state.drivers.find((d) => d.id === "drv-320");
      const ok = await window.persistShift(driver, "2026-08-02", "morning", "Spät", "06:30", "14:30", "91504");
      const shift = (window.state.shifts || []).find(
        (s) => s.driverId === "drv-320" && s.date === "2026-08-02"
      );
      return { ok, bus: shift?.bus || null, type: shift?.type || null };
    });
    expect(saved.ok).toBe(false);
    expect(saved.bus).not.toBe("91504");

    await expect(page.locator("#toast-container .toast")).toContainText(/91504/);
    await expect(page.locator("#toast-container .toast.error, #toast-container .toast")).toBeVisible();
  });

  test("happy: assigning bus with no overlapping duty saves without conflict toast", async ({ page }) => {
    const state = {
      ...minimalDemoState(),
      groups: [
        { id: "310", name: "Line 310", color: "#3D7EF5", active: true, companyId: "qa-local" },
        { id: "320", name: "Line 320", color: "#16a34a", active: true, companyId: "qa-local" }
      ],
      dispatchers: [
        {
          id: "dispo-1",
          name: "Demo Dispatcher",
          email: "dispo@qa.local",
          password: "Qa-test-ok-9",
          passwordChanged: true,
          groups: ["310", "320"],
          companyId: "qa-local"
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
      buses: [{
        id: "bus-1",
        number: "91504",
        groupId: "320",
        groupIds: ["320"],
        active: true,
        opsStatus: "active"
      }],
      shifts: []
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html");
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

    await expect(page.locator("#toast-container .toast")).toHaveCount(0);
  });

  test("block: inactive bus does not save", async ({ page }) => {
    const state = {
      ...minimalDemoState(),
      groups: [{ id: "320", name: "Line 320", color: "#16a34a", active: true, companyId: "qa-local" }],
      dispatchers: [
        {
          id: "dispo-1",
          name: "Demo Dispatcher",
          email: "dispo@qa.local",
          password: "Qa-test-ok-9",
          passwordChanged: true,
          groups: ["320"],
          companyId: "qa-local"
        }
      ],
      drivers: [{
        id: "drv-320",
        name: "Driver 320",
        pin: "1234",
        bus: "",
        groupId: "320",
        lineId: "320",
        active: true
      }],
      buses: [{
        id: "bus-1",
        number: "91504",
        groupId: "320",
        groupIds: ["320"],
        active: false,
        opsStatus: "active"
      }],
      shifts: []
    };
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    const saved = await page.evaluate(async () => {
      const driver = window.state.drivers.find((d) => d.id === "drv-320");
      const ok = await window.persistShift(driver, "2026-08-02", "morning", "Spät", "06:30", "14:30", "91504");
      return { ok };
    });
    expect(saved.ok).toBe(false);
  });
});
