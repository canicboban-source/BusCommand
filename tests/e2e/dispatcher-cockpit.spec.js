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
  test("live view keeps action and daily-plan columns usable at desktop widths", async ({ page }) => {
    const date = todayIso();
    const state = cockpitState();
    state.drivers = [
      ...state.drivers,
      {
        id: "drv-nobus",
        name: "No Bus Driver",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "",
        email: "nobus@example.test",
        phone: "+4310000003"
      }
    ];
    state.buses = [
      { id: "bus-1", number: "BUS-1", groupId: "101", lineId: "101", groupIds: ["101"], active: true, plate: "MD-101AA", opsStatus: "active", revision: 0 },
      { id: "bus-2", number: "BUS-2", groupId: "101", lineId: "101", groupIds: ["101"], active: true, plate: "MD-102AA", opsStatus: "active", revision: 0 }
    ];
    state.shifts = [
      ...state.shifts,
      {
        id: `shf-nobus-${date}`,
        driverId: "drv-nobus",
        driverName: "No Bus Driver",
        date,
        type: "morning",
        name: "101.S02",
        routeCode: "101.S02",
        bus: "",
        start: "05:30",
        end: "13:30",
        revision: 1
      }
    ];
    state.reports = [
      {
        id: "report-delay-layout",
        type: "delay:10",
        status: "active",
        severity: "sev_medium",
        date,
        time: "10:15",
        driverId: "drv-original",
        driver: "Original Driver",
        groupId: "101",
        bus: "BUS-1",
        reason: "Traffic"
      },
      {
        id: "report-coverage-layout",
        type: "coverage:disruption",
        status: "active",
        severity: "sev_high",
        date,
        time: "11:00",
        driverId: "drv-standby",
        driver: "Standby Driver",
        groupId: "101",
        bus: "",
        reason: "ops_coverage_unavailable",
        description: "Driver reported unavailable",
        affectedEntity: "driver"
      },
      {
        id: "report-breakdown-layout",
        type: "breakdown:bd_engine",
        status: "active",
        severity: "sev_high",
        date,
        time: "11:30",
        driverId: "drv-original",
        driver: "Original Driver",
        groupId: "101",
        bus: "BUS-1",
        reason: "Engine",
        affectedEntity: "vehicle"
      }
    ];
    await seedDemoState(page, state);

    async function assertCockpitColumns() {
      await expect(page.locator("#dispatcher-dashboard")).toBeVisible();
      await expect(page.locator("#dispatcher-live-alerts")).toBeVisible();
      await expect(page.locator(".ops-col-plan")).toBeVisible();
      await expect(page.locator("#ops-daily-plan-rows")).toBeVisible();
      const widths = await page.evaluate(() => {
        const action = document.querySelector(".ops-col-action");
        const plan = document.querySelector(".ops-col-plan");
        return {
          action: action ? Math.round(action.getBoundingClientRect().width) : 0,
          plan: plan ? Math.round(plan.getBoundingClientRect().width) : 0
        };
      });
      expect(widths.action).toBeGreaterThanOrEqual(200);
      expect(widths.plan).toBeGreaterThanOrEqual(280);
    }

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await assertCockpitColumns();
    await expect(page.locator("#dispatcher-live-alerts .urgent-action").first()).toBeVisible();
    // Live alerts = Needs attention SoT (reports + plan ops gaps); count can exceed field reports alone.
    expect(await page.locator("#dispatcher-live-alerts .urgent-action").count()).toBeGreaterThanOrEqual(3);

    await page.setViewportSize({ width: 1280, height: 800 });
    await assertCockpitColumns();

    // Cursor Live View / side preview widths — stack, do not crush the plan column.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.locator(".ops-col-action")).toBeVisible();
    await expect(page.locator(".ops-col-plan")).toBeVisible();
    await expect(page.locator("#ops-daily-plan-rows")).toBeVisible();
    const stacked = await page.evaluate(() => {
      const action = document.querySelector(".ops-col-action").getBoundingClientRect();
      const plan = document.querySelector(".ops-col-plan").getBoundingClientRect();
      return {
        actionWidth: Math.round(action.width),
        planWidth: Math.round(plan.width),
        planBelow: plan.top >= action.bottom - 2
      };
    });
    expect(stacked.actionWidth).toBeGreaterThanOrEqual(280);
    expect(stacked.planWidth).toBeGreaterThanOrEqual(280);
    expect(stacked.planBelow).toBe(true);

    await page.locator("#dispatcher-live-alerts .urgent-action").first().click();
    await expect(page.locator("#ops-attention-panel")).toBeVisible();

    // Attention B2 shows one focused card — pick Delay from the left index.
    const delayNav = page.locator(".ops-attention-nav-item").filter({ hasText: /delay|kašnjen|verspät|Traffic/i }).first();
    if (await delayNav.count()) await delayNav.click();
    const delayCard = page.locator(".ops-attention-card").filter({ hasText: /delay|kašnjen|verspät|Traffic/i }).first();
    await expect(delayCard).toBeVisible();
    await delayCard.locator('[data-attn-field="resolutionType"]').selectOption("restored");
    await delayCard.locator('[data-attn-field="note"]').fill("Live View layout check — traffic cleared.");
    await delayCard.locator("button.ops-attention-apply").click();
    await expect.poll(async () => page.evaluate(() =>
      window.state.reports.find((item) => item.id === "report-delay-layout")?.status
    )).toBe("resolved");
  });

  test("group overview actions focus the real driver and bus sections", async ({ page }) => {
    await seedDemoState(page, cockpitState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    await page.getByRole("button", { name: /View drivers|Uredi vozače|Fahrer/i }).click();
    await expect(page.locator("#hub-section-drivers")).toBeFocused();

    await page.locator('.hub-overview-actions [data-action="openVehiclesFromPlan"]').click();
    await expect(page.locator("#dispatcher-vehicles")).toBeVisible();
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
    await page.goto("/staff.html");
    await loginDispatcher(page);

    const resolve = page.locator("#dispatcher-live-alerts .urgent-action").first();
    // Report rows use ops_btn_resolve; coverage incidents use ops_attn_solve_now.
    await expect(resolve).toContainText(/Resolve(?: now| issue)?|Reši(?: odmah| problem)?|Sofort lösen|Lösen|Problem lösen/i);
    await resolve.click();
    await expect(page.locator("#ops-attention-panel")).toBeVisible();

    const card = page.locator(".ops-attention-card").filter({ hasText: /delay|kašnjen|verspät/i }).first();
    await card.locator('[data-attn-field="resolutionType"]').selectOption("restored");
    await card.locator('[data-attn-field="note"]').fill("Traffic cleared and service was verified.");
    await card.locator("button.ops-attention-apply").click();

    await expect.poll(async () => page.evaluate(() =>
      window.state.reports.find(item => item.id === "report-delay-1")?.status
    )).toBe("resolved");
    const report = await page.evaluate(() => window.state.reports.find(item => item.id === "report-delay-1"));
    expect(report.resolution).toEqual(expect.objectContaining({
      type: "restored",
      summary: "Traffic cleared and service was verified."
    }));
    await expect(page.locator('.ops-attention-card').filter({ hasText: /Traffic|delay|kašnjen/i })).toHaveCount(0);
  });

  test("drivers who know the target line sort ahead in Needs attention pools", async ({ page }) => {
    const date = todayIso();
    const state = cockpitState();
    state.groups = [
      { id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" },
      { id: "202", name: "Line 202", color: "#22C55E", active: true, companyId: "qa-local" }
    ];
    state.drivers = [
      {
        id: "drv-original",
        name: "Original Driver",
        groupId: "101",
        lineId: "101",
        knownGroupIds: ["101"],
        active: true,
        bus: "BUS-1",
        email: "original@example.test",
        phone: "+4310000001"
      },
      {
        id: "drv-knows",
        name: "Knows Line Driver",
        groupId: "202",
        lineId: "202",
        knownGroupIds: ["202", "101"],
        active: true,
        bus: "",
        email: "knows@example.test",
        phone: "+4310000005"
      },
      {
        id: "drv-other",
        name: "Other Line Driver",
        groupId: "202",
        lineId: "202",
        knownGroupIds: ["202"],
        active: true,
        bus: "",
        email: "other@example.test",
        phone: "+4310000006"
      }
    ];
    state.buses = [
      { id: "bus-1", number: "BUS-1", groupId: "101", lineId: "101", groupIds: ["101"], active: true }
    ];
    state.shifts = [
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
        revision: 1
      }
    ];
    state.reports = [{
      id: "report-coverage-knows",
      type: "coverage:disruption",
      status: "active",
      severity: "sev_high",
      date,
      time: "08:00",
      driverId: "drv-original",
      driver: "Original Driver",
      groupId: "101",
      bus: "BUS-1",
      reason: "ops_coverage_unavailable",
      description: "Driver reported unavailable"
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openOpsAttentionPanel("coverage:report-coverage-knows"));
    const card = page.locator(".ops-attention-card").filter({ hasText: /unavailable|nedostupan|nicht verfügbar/i }).first();
    await expect(card).toBeVisible();
    const otherGroup = card.locator('[data-attn-field="driver"] optgroup').filter({
      has: page.locator('option[value="drv-knows"]')
    });
    await expect(otherGroup.locator("option").nth(0)).toHaveAttribute("value", "drv-knows");
    await expect(otherGroup.locator("option[value='drv-knows']")).toContainText(/knows 101|zna 101|kennt 101/i);
  });

  test("wrong shift code is corrected from catalog inside Needs attention", async ({ page }) => {
    const date = todayIso();
    const state = cockpitState();
    state.shiftCatalogs = {
      "101": {
        line: "101",
        lineId: "101",
        locked: false,
        entries: {
          "101.S01": {
            code: "101.S01",
            label: "101.S01",
            type: "morning",
            start: "05:15",
            end: "13:15"
          },
          "101.S02": {
            code: "101.S02",
            label: "101.S02",
            type: "morning",
            start: "06:00",
            end: "14:00"
          }
        }
      }
    };
    state.drivers = [{
      id: "drv-wrong",
      name: "Wrong Code Driver",
      groupId: "101",
      lineId: "101",
      active: true,
      bus: "BUS-1",
      email: "wrong@example.test",
      phone: "+4310000004"
    }];
    state.buses = [
      { id: "bus-1", number: "BUS-1", groupId: "101", lineId: "101", groupIds: ["101"], active: true }
    ];
    state.shifts = [{
      id: `shf-wrong-${date}`,
      driverId: "drv-wrong",
      driverName: "Wrong Code Driver",
      date,
      type: "morning",
      name: "LEGACY.X",
      routeCode: "LEGACY.X",
      bus: "BUS-1",
      start: "05:15",
      end: "13:15",
      revision: 1
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openOpsAttentionPanel());
    const card = page.locator(".ops-attention-card").filter({ hasText: /Wrong Code Driver|pogrešn|wrong|falsch/i }).first();
    await expect(card).toBeVisible();
    await card.locator('[data-attn-field="duty"]').selectOption("101.S02");
    await card.locator("button.ops-attention-apply").click();

    await expect.poll(async () => page.evaluate(() => {
      const shift = window.state.shifts.find(item => item.driverId === "drv-wrong");
      return shift?.routeCode || shift?.name || "";
    })).toBe("101.S02");
    await expect(page.locator('.ops-attention-card[data-attn-id="shift:drv-wrong"]')).toHaveCount(0);
  });

  test("dispatcher can edit bus plate and ops status; breakdown leaves the free pool", async ({ page }) => {
    const date = todayIso();
    const state = cockpitState();
    state.buses = [
      {
        id: "bus-edit",
        number: "BUS-EDIT",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        plate: "MD-100AA",
        opsStatus: "active",
        revision: 0
      }
    ];
    state.drivers = [{
      id: "drv-nobus-2",
      name: "Needs Bus Driver",
      groupId: "101",
      lineId: "101",
      active: true,
      bus: "",
      email: "needsbus@example.test",
      phone: "+4310000007"
    }];
    state.shifts = [{
      id: `shf-needsbus-${date}`,
      driverId: "drv-nobus-2",
      driverName: "Needs Bus Driver",
      date,
      type: "morning",
      name: "101.S01",
      routeCode: "101.S01",
      bus: "",
      start: "05:15",
      end: "13:15",
      revision: 1
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => (window.openVehiclesForGroup || window.openGroupHub)("101"));
    await expect(page.locator("#dispatcher-vehicles")).toBeVisible();
    await page.locator('.bus-fleet-row[data-bus-id="bus-edit"] .row-actions-trigger').click();
    await page.locator("body > .row-actions-menu .hub-bus-edit-btn:visible").click();
    const form = page.locator('[data-bus-edit="bus-edit"]');
    await expect(form).toBeVisible();
    await form.locator('input[name="plate"]').fill("MD-200BB");
    await form.locator('button[type="submit"]').click();

    await expect.poll(async () => page.evaluate(() => {
      const bus = window.state.buses.find(item => item.id === "bus-edit");
      return `${bus?.plate}|${bus?.opsStatus}|${bus?.revision}`;
    })).toBe("MD-200BB|active|1");

    // Fast 1-click status switch (D21) — no form, just the status pill.
    await page.locator('.bus-fleet-row[data-bus-id="bus-edit"] .bus-status-breakdown').click();

    await expect.poll(async () => page.evaluate(() => {
      const bus = window.state.buses.find(item => item.id === "bus-edit");
      return `${bus?.plate}|${bus?.opsStatus}|${bus?.revision}`;
    })).toBe("MD-200BB|breakdown|2");

    await page.evaluate(() => window.openOpsAttentionPanel());
    const card = page.locator(".ops-attention-card").filter({ hasText: /Needs Bus Driver|nema autobusa|missing bus|kein bus/i }).first();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-attn-field="bus"] option[value="BUS-EDIT"]')).toHaveCount(0);
  });

  test("missing bus pools order same group then company then other groups and assign applies", async ({ page }) => {
    const date = todayIso();
    const state = cockpitState();
    state.groups = [
      { id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" },
      { id: "202", name: "Line 202", color: "#22C55E", active: true, companyId: "qa-local" }
    ];
    state.drivers = [
      {
        id: "drv-nobus",
        name: "No Bus Driver",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "",
        email: "nobus@example.test",
        phone: "+4310000003"
      }
    ];
    state.buses = [
      { id: "bus-same", number: "BUS-SAME", groupId: "101", lineId: "101", groupIds: ["101"], active: true },
      { id: "bus-co", number: "BUS-CO", groupId: "", lineId: "", groupIds: [], active: true },
      { id: "bus-other", number: "BUS-OTHER", groupId: "202", lineId: "202", groupIds: ["202"], active: true }
    ];
    state.shifts = [{
      id: `shf-nobus-${date}`,
      driverId: "drv-nobus",
      driverName: "No Bus Driver",
      date,
      type: "morning",
      name: "101.S01",
      routeCode: "101.S01",
      bus: "",
      start: "05:15",
      end: "13:15",
      revision: 1
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => window.openOpsAttentionPanel());
    await expect(page.locator("#ops-attention-panel")).toBeVisible();

    const card = page.locator(".ops-attention-card").filter({ hasText: /No Bus Driver|nema autobusa|missing bus|kein bus/i }).first();
    await expect(card).toBeVisible();
    const busSelect = card.locator('[data-attn-field="bus"]');
    await expect(busSelect.locator("optgroup").nth(0)).toHaveAttribute("label", /This group|Ova grupa|Diese Gruppe/i);
    await expect(busSelect.locator("optgroup").nth(1)).toHaveAttribute("label", /Company|Firma/i);
    await expect(busSelect.locator("optgroup").nth(2)).toHaveAttribute("label", /Other groups|Druge grupe|Andere Gruppen/i);
    await expect(busSelect.locator("optgroup").nth(0).locator("option")).toHaveAttribute("value", "BUS-SAME");
    await expect(busSelect.locator("optgroup").nth(1).locator("option")).toHaveAttribute("value", "BUS-CO");
    await expect(busSelect.locator("optgroup").nth(2).locator("option")).toHaveAttribute("value", "BUS-OTHER");

    await busSelect.selectOption("BUS-SAME");
    await card.locator("button.ops-attention-apply").click();

    await expect.poll(async () => page.evaluate(() =>
      window.state.shifts.find(item => item.driverId === "drv-nobus")?.bus
    )).toBe("BUS-SAME");
    await expect(page.locator('.ops-attention-card[data-attn-id="bus:drv-nobus"]')).toHaveCount(0);
  });

  test("daily replacement records the incident first and applies one guided resolution", async ({ page }) => {
    const state = cockpitState();
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate((date) =>
      window.dailyPlanAssignDriver(date, "morning", "101.S01", "drv-standby"),
      todayIso()
    );

    await expect(page.locator("#ops-incident-modal")).toBeVisible();
    const before = await page.evaluate(() => ({
      original: window.state.shifts.find(item => item.driverId === "drv-original"),
      standby: window.state.shifts.find(item => item.driverId === "drv-standby")
    }));
    expect(before.original.type).toBe("morning");
    expect(before.standby.type).toBe("bereitschaft");

    await page.locator("#ops-incident-reason-code").selectOption("no_show");
    await page.locator("#ops-incident-modal button[type='submit']").click();

    await expect(page.locator("#ops-attention-panel")).toBeVisible();
    // Single-card sheet: focus coverage item then apply guided replacement.
    await page.evaluate(() => {
      const coverage = (window.state.reports || []).find((r) =>
        r.type === "coverage:disruption" && (r.status === "open" || r.status === "active")
      );
      const id = coverage ? `coverage:${coverage.id}` : "";
      if (id && typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(id);
    });
    const coverageCard = page.locator(".ops-attention-card").filter({ hasText: /unavailable|nedostupan|nicht verfügbar|No show|no_show|Nije se pojavio/i }).first();
    await expect(coverageCard).toBeVisible();
    await expect(coverageCard.locator('[data-attn-field="driver"]')).toHaveValue("drv-standby");
    await expect(coverageCard.locator('[data-attn-field="bus"]')).toHaveValue("BUS-1");
    await coverageCard.locator("button.ops-attention-apply").click();

    await expect.poll(async () => page.evaluate(() =>
      window.state.reports.find(item => item.type === "coverage:disruption")?.status
    )).toBe("resolved");
    // Panel may remain open if other attention items remain in the shared queue.
    await expect(page.locator(".ops-attention-card").filter({ hasText: /unavailable|nedostupan|nicht verfügbar/i })).toHaveCount(0);

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

  test("desktop native select options remain readable on a light Windows-style popup", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await seedDemoState(page, cockpitState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    const colors = await page.locator(".ops-edit-select").first().evaluate((select) => {
      const option = select.options[0];
      const disabledOption = Array.from(select.options).find(item => item.disabled);
      const selectStyle = getComputedStyle(select);
      const optionStyle = getComputedStyle(option);
      const disabledStyle = disabledOption ? getComputedStyle(disabledOption) : null;
      return {
        colorScheme: selectStyle.colorScheme,
        optionColor: optionStyle.color,
        optionBackground: optionStyle.backgroundColor,
        disabledColor: disabledStyle?.color || null,
        disabledBackground: disabledStyle?.backgroundColor || null
      };
    });
    expect(colors.colorScheme).toContain("dark");
    expect(colors.optionColor).toBe("rgb(15, 23, 42)");
    expect(colors.optionBackground).toBe("rgb(255, 255, 255)");
    expect(colors.optionColor).not.toBe(colors.optionBackground);
    if (colors.disabledColor) {
      expect(colors.disabledColor).toBe("rgb(100, 116, 139)");
      expect(colors.disabledBackground).toBe("rgb(241, 245, 249)");
    }
  });
});
