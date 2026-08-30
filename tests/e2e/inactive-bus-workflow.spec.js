const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DRIVER_ID = "drv-e2e";
const DRIVER_NAME = "Marko Marković";

function inactiveBusState() {
  const date = todayIso();
  return {
    ...minimalDemoState(),
    language: "sr",
    activeLineId: "101",
    activeGroupHubId: "101",
    activeGroupFilter: "101",
    groups: [
      { id: "101", name: "Linija 101", color: "#3b82f6", active: true, companyId: "qa-local" }
    ],
    dispatchers: [
      {
        id: "dispo-qa-1",
        name: "QA Dispatcher",
        email: "dispo@qa.local",
        password: "Qa-test-ok-9",
        passwordChanged: true,
        groups: ["101"],
        companyId: "qa-local"
      }
    ],
    drivers: [
      {
        id: DRIVER_ID,
        name: DRIVER_NAME,
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "qa-local",
        email: "marko@example.test",
        pin: "1234"
      }
    ],
    buses: [
      {
        id: "bus-91501",
        number: "91501",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "active",
        garage: "Depot A",
        revision: 0
      },
      {
        id: "bus-91502",
        number: "91502",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "reserve",
        garage: "Depot A",
        revision: 0
      },
      {
        id: "bus-91504",
        number: "91504",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "active",
        garage: "Depot A",
        revision: 0
      }
    ],
    shifts: [
      {
        id: `shf-marko-${date}`,
        driverId: DRIVER_ID,
        driverName: DRIVER_NAME,
        groupId: "101",
        date,
        type: "morning",
        name: "101.101",
        routeCode: "101.101",
        bus: "91504",
        start: "05:15",
        end: "13:15",
        revision: 1
      }
    ],
    reports: [],
    opsChangeLog: []
  };
}

test.describe("Inactive bus operational integrity workflow", () => {
  test("assigned bus becoming inactive raises critical attention card, displays context, and clears upon valid replacement", async ({ page }) => {
    const date = todayIso();
    await seedDemoState(page, inactiveBusState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    // Set Serbian language
    await page.evaluate(() => {
      localStorage.setItem("buscommand_lang", "sr");
      if (window.state) window.state.language = "sr";
      if (typeof window.applyUiLanguagePreference === "function") {
        window.applyUiLanguagePreference("sr");
      }
    });

    // 1. Initial healthy state: Marko has duty 101.101 with Bus 91504
    await page.evaluate(({ d, driverId, driverName }) => {
      const shift = {
        id: `shf-marko-${d}`,
        driverId,
        driverName,
        groupId: "101",
        date: d,
        type: "morning",
        name: "101.101",
        routeCode: "101.101",
        bus: "91504",
        start: "05:15",
        end: "13:15",
        revision: 1
      };
      if (!window.state.shifts) window.state.shifts = [];
      const idx = window.state.shifts.findIndex((s) => s.driverId === driverId && s.date === d);
      if (idx >= 0) window.state.shifts[idx] = shift;
      else window.state.shifts.push(shift);
      if (typeof window.saveState === "function") window.saveState();
      if (typeof window.renderDispatcherDashboard === "function") window.renderDispatcherDashboard();
    }, { d: date, driverId: DRIVER_ID, driverName: DRIVER_NAME });

    // 2. Bus 91504 becomes inactive / breakdown
    await page.evaluate(() => {
      const bus = window.state.buses.find((b) => b.number === "91504");
      if (bus) {
        bus.active = false;
        bus.opsStatus = "breakdown";
      }
      if (typeof window.saveState === "function") window.saveState();
      if (typeof window.renderDispatcherDashboard === "function") window.renderDispatcherDashboard();
      if (typeof window.syncOpsPlanHealthAttentionState === "function") window.syncOpsPlanHealthAttentionState();
    });

    // 3. Existing assignment remains visible as context in dispatcher UI
    const busSelect = page.locator(`#ops-bus-crew-${DRIVER_ID}`);
    if (await busSelect.isVisible().catch(() => false)) {
      // 4. The inactive bus is selected but disabled as context; active buses are selectable
      const disabledOption = busSelect.locator("option[value='91504']");
      await expect(disabledOption).toBeDisabled();
      await expect(disabledOption).toContainText("neaktivan");

      // Active replacement bus 91501 is selectable
      const activeOption = busSelect.locator("option[value='91501']");
      await expect(activeOption).not.toBeDisabled();
    }

    // 5. Open Needs Attention panel focusing the inactive_bus problem
    await page.evaluate(({ d, driverId }) => {
      const targetId = `inactive_bus:${driverId}:91504:${d}`;
      if (typeof window.openOpsAttentionPanel === "function") {
        window.openOpsAttentionPanel(targetId);
      }
    }, { d: date, driverId: DRIVER_ID });

    await expect(page.locator("#ops-attention-panel")).toBeVisible();

    const inactiveBusCard = page.locator(".ops-attention-card.is-critical");
    await expect(inactiveBusCard).toBeVisible();

    // 6. Verify exact Serbian message in card summary
    await expect(inactiveBusCard).toContainText("Autobus 91504 je neaktivan. Izaberi drugi autobus.");

    // 7. The daily plan / cockpit visibly marks the assignment as critical
    const criticalIndicator = page.locator(".daily-plan-row--critical, .ops-edit-select.is-critical, .ops-attention-card.is-critical");
    await expect(criticalIndicator.first()).toBeVisible();

    // Candidate list in card only offers assignable buses (91501, 91502), NOT 91504
    const cardSelect = inactiveBusCard.locator("select.ops-attention-select");
    const optionValues = await cardSelect.locator("option").evaluateAll((opts) =>
      opts.map((o) => o.value).filter(Boolean)
    );
    expect(optionValues).toContain("91501");
    expect(optionValues).toContain("91502");
    expect(optionValues).not.toContain("91504");

    // 8. Select assignable replacement bus 91501 and apply fix
    await cardSelect.selectOption("91501");
    const applyBtn = inactiveBusCard.locator(".ops-attention-apply");
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // 9. The inactive-bus attention item disappears after successful replacement
    await expect(page.locator(".ops-attention-card").filter({ hasText: /91504/ })).toHaveCount(0);
    await expect(page.locator(".ops-attention-nav-item").filter({ hasText: /91504/ })).toHaveCount(0);

    // 10. The replacement shift remains otherwise unchanged: same driver, date, duty, start/end
    const updatedShift = await page.evaluate(({ d, driverId }) => {
      return window.state.shifts.find((s) => s.driverId === driverId && s.date === d);
    }, { d: date, driverId: DRIVER_ID });
    expect(updatedShift).toBeDefined();
    expect(updatedShift.driverId).toBe(DRIVER_ID);
    expect(updatedShift.date).toBe(date);
    expect(updatedShift.type).toBe("morning");
    expect(updatedShift.routeCode || updatedShift.name).toBe("101.101");
    expect(updatedShift.bus).toBe("91501");

    // 11. Refresh / re-render does not resurrect the resolved problem
    await page.evaluate(() => {
      if (typeof window.renderDispatcherDashboard === "function") {
        window.renderDispatcherDashboard();
      }
      if (typeof window.syncOpsPlanHealthAttentionState === "function") {
        window.syncOpsPlanHealthAttentionState();
      }
    });
    await expect(page.locator(".ops-attention-card").filter({ hasText: /91504/ })).toHaveCount(0);
    await expect(page.locator(".ops-attention-nav-item").filter({ hasText: /91504/ })).toHaveCount(0);
  });
});
