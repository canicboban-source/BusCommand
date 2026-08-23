const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function guidedState() {
  const today = localToday();
  return {
    ...minimalDemoState(),
    language: "en",
    drivers: [
      {
        id: "drv-marko",
        name: "Marko Sick",
        pin: "1234",
        bus: "91103",
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "qa-local"
      },
      {
        id: "drv-spare",
        name: "Spare Driver",
        pin: "5678",
        bus: "",
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "qa-local"
      }
    ],
    buses: [
      {
        id: "bus-91103",
        number: "91103",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "active",
        revision: 0
      },
      {
        id: "bus-91104",
        number: "91104",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "active",
        revision: 0
      }
    ],
    shifts: [
      {
        driverId: "drv-marko",
        driverName: "Marko Sick",
        date: today,
        type: "morning",
        name: "E1",
        start: "05:00",
        end: "13:00",
        bus: "91103",
        revision: 1
      }
    ],
    reports: [],
    opsChangeLog: []
  };
}

test.describe("Dispo guided incident (reason → plan → attention)", () => {
  test("driver sick: reason dropdown aligns plan and opens Needs attention", async ({ page }) => {
    await seedDemoState(page, guidedState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (typeof window.openOperationalIncident === "function") {
        window.openOperationalIncident("drv-marko");
      } else {
        throw new Error("openOperationalIncident missing");
      }
    });

    const modal = page.locator("#ops-incident-modal");
    await expect(modal).toBeVisible();
    await page.locator("#ops-incident-reason-code").selectOption("sick");
    await page.locator("#ops-incident-form button[type='submit']").click();

    await expect(page.locator("#ops-attention-panel")).toBeVisible({ timeout: 10000 });

    const aligned = await page.evaluate(() => {
      const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      const shift = (window.state.shifts || []).find(
        (s) => s.driverName === "Marko Sick" && s.date === today
      );
      const report = (window.state.reports || []).find((r) => r.driver === "Marko Sick" || r.driverId === "drv-marko");
      const log = (window.state.opsChangeLog || []).find((e) => e.type === "driver_incident_opened");
      return {
        shiftType: shift?.type || null,
        reportOpen: report?.status === "open",
        reasonCode: report?.reasonCode || log?.reason || null,
        hasAudit: Boolean(log?.by && log?.at && log?.reason),
        today
      };
    });
    expect(aligned.shiftType).toBe("sick");
    expect(aligned.reportOpen).toBeTruthy();
    expect(aligned.reasonCode).toBe("sick");
    expect(aligned.hasAudit).toBeTruthy();
  });

  test("bus AC: reason dropdown marks bus breakdown and opens Needs attention", async ({ page }) => {
    await seedDemoState(page, guidedState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (typeof window.openVehicleOperationalIncident === "function") {
        window.openVehicleOperationalIncident("91103", "Marko Sick");
      } else {
        throw new Error("openVehicleOperationalIncident missing");
      }
    });

    await expect(page.locator("#ops-incident-modal")).toBeVisible();
    await page.locator("#ops-incident-reason-code").selectOption("ac_climate");
    await page.locator("#ops-incident-form button[type='submit']").click();

    await expect(page.locator("#ops-attention-panel")).toBeVisible({ timeout: 10000 });

    const aligned = await page.evaluate(() => {
      const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      const bus = (window.state.buses || []).find((b) => b.number === "91103");
      const shift = (window.state.shifts || []).find(
        (s) => s.driverName === "Marko Sick" && s.date === today
      );
      const report = (window.state.reports || []).find((r) => String(r.bus || "") === "91103");
      const log = (window.state.opsChangeLog || []).find((e) => e.type === "bus_incident_opened");
      return {
        opsStatus: bus?.opsStatus || null,
        shiftBus: shift?.bus == null ? "" : String(shift.bus),
        reportOpen: report?.status === "open",
        reasonCode: report?.reasonCode || log?.reason || null,
        hasAudit: Boolean(log?.by && log?.at && log?.reason)
      };
    });
    expect(aligned.opsStatus).toBe("breakdown");
    expect(aligned.shiftBus).toBe("");
    expect(aligned.reportOpen).toBeTruthy();
    expect(aligned.reasonCode).toBe("ac_climate");
    expect(aligned.hasAudit).toBeTruthy();
  });
});
