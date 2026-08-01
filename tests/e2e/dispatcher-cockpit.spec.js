const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cockpitState() {
  const date = todayIso();
  return {
    ...minimalDemoState(),
    drivers: [
      {
        id: "drv-original",
        name: "Original Driver",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "BUS-1",
        email: "original@example.test",
        phone: "+4310000001"
      },
      {
        id: "drv-standby",
        name: "Standby Driver",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "",
        email: "standby@example.test",
        phone: "+4310000002"
      }
    ],
    buses: [
      { id: "bus-1", number: "BUS-1", groupId: "101", lineId: "101", active: true }
    ],
    shifts: [
      {
        id: `shf-original-${date}`,
        driverId: "drv-original",
        driverName: "Original Driver",
        date,
        type: "morning",
        name: "101.S01",
        routeCode: "101.S01",
        bus: "BUS-1",
        start: "05:15",
        end: "13:15",
        revision: 2
      },
      {
        id: `shf-standby-${date}`,
        driverId: "drv-standby",
        driverName: "Standby Driver",
        date,
        type: "bereitschaft",
        name: "Standby",
        routeCode: "",
        bus: "",
        revision: 1
      }
    ],
    reports: []
  };
}

test.describe("Dispatcher cockpit resolution flows", () => {
  test("group overview actions focus the real driver and bus sections", async ({ page }) => {
    await seedDemoState(page, cockpitState());
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    await page.getByRole("button", { name: "View drivers" }).click();
    await expect(page.locator("#hub-section-drivers")).toBeFocused();

    await page.locator('.hub-overview-actions [data-action="scrollHubSection"]').nth(1).click();
    await expect(page.locator("#hub-section-buses")).toBeFocused();
  });

  test("generic report requires a verified resolution record", async ({ page }) => {
    const state = cockpitState();
    state.reports = [{
      id: "report-delay-1",
      type: "delay:10",
      status: "active",
      severity: "sev_medium",
      date: todayIso(),
      time: "10:15",
      driverId: "drv-original",
      driver: "Original Driver",
      groupId: "101",
      bus: "BUS-1",
      reason: "Traffic"
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    const resolve = page.locator("#dispatcher-live-alerts .urgent-action").first();
    await expect(resolve).toContainText("Resolve issue");
    await resolve.click();
    await expect(page.locator("#report-resolution-modal")).toBeVisible();

    await page.locator("#report-resolution-type").selectOption("restored");
    await page.locator("#report-resolution-summary").fill("Traffic cleared and service was verified.");
    await page.locator("#report-resolution-modal button[type='submit']").click();

    await expect(page.locator("#report-resolution-modal")).toBeHidden();
    const report = await page.evaluate(() => window.state.reports.find(item => item.id === "report-delay-1"));
    expect(report.status).toBe("resolved");
    expect(report.resolution).toEqual(expect.objectContaining({
      type: "restored",
      summary: "Traffic cleared and service was verified."
    }));
  });

  test("daily replacement records the incident first and applies one guided resolution", async ({ page }) => {
    const state = cockpitState();
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate((date) =>
      window.dailyPlanAssignDriver(date, "morning", "101.S01", "Standby Driver"),
      todayIso()
    );

    await expect(page.locator("#ops-incident-modal")).toBeVisible();
    const before = await page.evaluate(() => ({
      original: window.state.shifts.find(item => item.driverId === "drv-original"),
      standby: window.state.shifts.find(item => item.driverId === "drv-standby")
    }));
    expect(before.original.type).toBe("morning");
    expect(before.standby.type).toBe("bereitschaft");

    await page.locator("#ops-incident-reason").fill("Driver reported unavailable");
    await page.locator("#ops-incident-modal button[type='submit']").click();

    await expect(page.locator("#ops-coverage-resolver-modal")).toBeVisible();
    await expect(page.locator("#ops-coverage-driver")).toHaveValue("drv-standby");
    await expect(page.locator("#ops-coverage-bus")).toHaveValue("BUS-1");
    await page.locator("#ops-coverage-resolver-modal button[type='submit']").click();
    await expect(page.locator("#ops-coverage-resolver-modal")).toBeHidden();

    const after = await page.evaluate(() => ({
      report: window.state.reports.find(item => item.type === "coverage:disruption"),
      original: window.state.shifts.find(item => item.driverId === "drv-original"),
      standby: window.state.shifts.find(item => item.driverId === "drv-standby")
    }));
    expect(after.report.status).toBe("resolved");
    expect(after.original).toBeUndefined();
    expect(after.standby).toEqual(expect.objectContaining({
      type: "morning",
      bus: "BUS-1",
      routeCode: "101.S01"
    }));
  });

  test("desktop native select options remain readable without hover", async ({ page }) => {
    await seedDemoState(page, cockpitState());
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    const colors = await page.locator(".ops-edit-select").first().evaluate((select) => {
      const option = select.options[0];
      const selectStyle = getComputedStyle(select);
      const optionStyle = getComputedStyle(option);
      return {
        colorScheme: selectStyle.colorScheme,
        optionColor: optionStyle.color,
        optionBackground: optionStyle.backgroundColor
      };
    });
    expect(colors.colorScheme).toContain("dark");
    expect(colors.optionColor).not.toBe(colors.optionBackground);
    expect(colors.optionColor).toBe("rgb(248, 250, 252)");
    expect(colors.optionBackground).toBe("rgb(11, 20, 36)");
  });
});
