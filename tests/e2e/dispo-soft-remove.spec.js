const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function softRemoveState() {
  const month = "2026-08";
  return {
    ...minimalDemoState(),
    drivers: [
      {
        id: "drv-soft-1",
        name: "Soft Remove Driver",
        pin: "1234",
        bus: "91103",
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "demo"
      },
      {
        id: "drv-keep",
        name: "Keep On Line",
        pin: "5678",
        bus: "91104",
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "demo"
      }
    ],
    buses: [
      {
        id: "bus-soft-1",
        number: "91103",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "ready",
        revision: 0
      },
      {
        id: "bus-soft-2",
        number: "91104",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "ready",
        revision: 0
      }
    ],
    schedules: [
      {
        id: `Soft Remove Driver_${month}`,
        driverName: "Soft Remove Driver",
        driverId: "drv-soft-1",
        month,
        parsedShifts: {
          1: { type: "morning", name: "E1", start: "05:00", end: "13:00" },
          2: { type: "morning", name: "E1", start: "05:00", end: "13:00" }
        }
      }
    ],
    shifts: [
      {
        driverId: "drv-soft-1",
        driverName: "Soft Remove Driver",
        date: "2026-08-04",
        type: "morning",
        name: "E1",
        start: "05:00",
        end: "13:00",
        bus: "91103",
        revision: 1
      }
    ]
  };
}

async function confirmModal(page, reason = "plan_correction") {
  const modal = page.locator("#global-confirm-modal");
  await expect(modal).toBeVisible();
  const reasonSelect = modal.locator("#global-confirm-reason");
  if (await reasonSelect.count()) {
    await reasonSelect.selectOption(reason);
  }
  const confirmBtn = modal.locator("[data-action='confirmModalYes'], #global-confirm-yes, button.btn-primary").first();
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();
}

test.describe("Dispo soft-remove (list, not company)", () => {
  test("deactivate bus and detach bus from line 101", async ({ page }) => {
    await seedDemoState(page, softRemoveState());
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => (window.openVehiclesForGroup || window.openGroupHub)("101"));
    await expect(page.locator("#settings-buses-list")).toContainText("91103");

    await page.locator('#settings-buses-list li[data-bus-id="bus-soft-1"] [data-action="deleteBus"]').click();
    await confirmModal(page);

    const stillInCompany = await page.evaluate(() => {
      const bus = (window.state.buses || []).find((b) => b.id === "bus-soft-1");
      return Boolean(bus && bus.active === false);
    });
    expect(stillInCompany).toBeTruthy();

    await page.locator('#settings-buses-list li[data-bus-id="bus-soft-2"] [data-action="detachBusFromLine"]').click();
    await confirmModal(page);

    const detached = await page.evaluate(() => {
      const bus = (window.state.buses || []).find((b) => b.id === "bus-soft-2");
      const ids = (bus?.groupIds || [bus?.groupId, bus?.lineId].filter(Boolean) || []).map(String);
      return Boolean(bus) && !ids.includes("101");
    });
    expect(detached).toBeTruthy();
    const stillFleet = await page.evaluate(() =>
      (window.state.buses || []).some((b) => b.id === "bus-soft-2")
    );
    expect(stillFleet).toBeTruthy();
  });

  test("detach driver from line 101 keeps company roster entry", async ({ page }) => {
    await seedDemoState(page, softRemoveState());
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => window.openGroupHub("101"));
    await expect(page.locator("#group-hub-overview-detail")).toContainText("Soft Remove Driver");

    await page.locator('#group-hub-overview-detail [data-action="detachDriverFromLine"]').first().click();
    await confirmModal(page);

    await expect(page.locator("#group-hub-overview-detail")).not.toContainText("Soft Remove Driver");
    await expect(page.locator("#group-hub-overview-detail")).toContainText("Keep On Line");

    const roster = await page.evaluate(() => {
      const d = (window.state.drivers || []).find((x) => x.id === "drv-soft-1");
      return {
        exists: Boolean(d),
        active: d?.active !== false,
        groupId: d?.groupId || "",
        lineId: d?.lineId || ""
      };
    });
    expect(roster.exists).toBeTruthy();
    expect(roster.active).toBeTruthy();
    expect(roster.groupId).toBe("");
    expect(roster.lineId).toBe("");
  });

  test("delete monthly plan for one driver-month", async ({ page }) => {
    await seedDemoState(page, softRemoveState());
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
      else if (typeof window.openMonthlyPlanForGroup === "function") window.openMonthlyPlanForGroup("101");
    });

    await page.evaluate(() => {
      const sel = document.getElementById("monthly-driver-select");
      const monthSel = document.getElementById("monthly-month-select");
      if (monthSel) {
        if (![...monthSel.options].some((o) => o.value === "2026-08")) {
          const opt = document.createElement("option");
          opt.value = "2026-08";
          opt.textContent = "2026-08";
          monthSel.appendChild(opt);
        }
        monthSel.value = "2026-08";
      }
      if (sel) {
        sel.value = "Soft Remove Driver";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (typeof window.loadMonthlyPlanForDriver === "function") window.loadMonthlyPlanForDriver();
    });

    await expect(page.locator("[data-action='deleteMonthlyPlan']").first()).toBeVisible({ timeout: 10000 });
    await page.locator("[data-action='deleteMonthlyPlan']").first().click();
    await confirmModal(page);

    const gone = await page.evaluate(() =>
      !(window.state.schedules || []).some((s) => s.id === "Soft Remove Driver_2026-08" && s.parsedShifts)
    );
    expect(gone).toBeTruthy();
    const stillDriver = await page.evaluate(() =>
      (window.state.drivers || []).some((d) => d.id === "drv-soft-1")
    );
    expect(stillDriver).toBeTruthy();
  });

  test("clear one daily shift with confirm", async ({ page }) => {
    // Not "today" so covered-shift incident gate does not block clear.
    const date = "2026-08-10";
    const state = softRemoveState();
    state.shifts = [
      {
        driverId: "drv-soft-1",
        driverName: "Soft Remove Driver",
        date,
        type: "morning",
        name: "E1",
        start: "05:00",
        end: "13:00",
        bus: "91103",
        revision: 1
      }
    ];
    await seedDemoState(page, state);
    await page.goto("/staff.html?mode=demo");
    await loginDispatcher(page);

    const invoked = await page.evaluate((d) => {
      if (typeof window.clearDailyShift !== "function") return false;
      window.clearDailyShift("Soft Remove Driver", d);
      return true;
    }, date);
    expect(invoked).toBeTruthy();
    await confirmModal(page);

    const cleared = await page.evaluate((d) => {
      const shift = (window.state.shifts || []).find(
        (s) => s.driverName === "Soft Remove Driver" && s.date === d
      );
      if (!shift) return true;
      return shift.type === "clear" || shift.type === "off";
    }, date);
    expect(cleared).toBeTruthy();
  });
});
