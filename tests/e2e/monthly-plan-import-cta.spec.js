const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

/**
 * Phase 0 — Dispo monthly CTA opens import zone; day edit writes QA local state.
 *
 * Scope honesty:
 * - Proves UI handler + in-memory / localStorage write under QA harness.
 * - Does NOT page.reload (harness initScript would re-seed and wipe writes).
 * - Does NOT claim server/Firebase persistence (that is a later phase).
 */
function monthKeyFromDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function importCtaState() {
  const month = monthKeyFromDate();
  const state = {
    ...minimalDemoState(),
    drivers: [
      {
        id: "drv-import-cta",
        name: "Import CTA Driver",
        pin: "1234",
        bus: "91101",
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "qa-local"
      }
    ],
    buses: [
      { id: "bus-91101", number: "91101", groupId: "101", lineId: "101", active: true, companyId: "qa-local" }
    ],
    schedules: [],
    shifts: [],
    shiftCatalogs: {
      "101": {
        groupId: "101",
        shifts: [
          { code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }
        ]
      }
    }
  };
  state._e2eMonth = month;
  return state;
}

test.describe("Dispo monthly plan import CTA", () => {
  test("import CTA opens zone; vacation day edit persists in QA local state", async ({ page }) => {
    const state = importCtaState();
    const month = state._e2eMonth;
    const dateStr = `${month}-03`;

    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (typeof window.openMonthlyPlansFull === "function") {
        window.openMonthlyPlansFull();
      } else if (typeof window.openMonthlyPlanForGroup === "function") {
        window.openMonthlyPlanForGroup("101");
      }
    });

    await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });

    const importBtn = page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first();
    await expect(importBtn).toBeVisible();
    await importBtn.click();

    const importZone = page.locator("#dispo-monthly-plan-import");
    await expect(importZone).toBeVisible();
    await expect(page.locator("#plan-import-dropzone")).toBeVisible();
    await expect(page.locator("#new-plan-modal")).toHaveCount(0);

    await page.evaluate(({ driverName, monthKey, day }) => {
      if (typeof window.openMonthlyDayEditForDriver === "function") {
        window.openMonthlyDayEditForDriver(driverName, monthKey, day);
      }
    }, { driverName: "Import CTA Driver", monthKey: month, day: 3 });

    await expect(page.locator("#monthly-day-edit-modal")).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(page.locator("#monthly-day-edit-modal")).not.toContainText("monthly_edit_day");
    await page.locator("#med-shift-type").selectOption("vacation");
    await page.locator('[data-action="saveMonthlyDayEdit"]').click();
    await expect(page.locator("#monthly-day-edit-modal")).toHaveClass(/hidden/, { timeout: 10000 });

    const summary = page.locator("#monthly-plan-driver-summary");
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText(/work days|radnih dana|Arbeitstage/i);
    await expect(summary).toContainText(/1 assigned day|1 dodeljen dan|1 zugewiesener Tag/i);

    const persisted = await page.evaluate((iso) => {
      const inMemory = (window.state.shifts || []).some((s) =>
        String(s.driverName || "") === "Import CTA Driver"
        && String(s.date || "") === iso
        && String(s.type || "") === "vacation"
      );
      const key = "buscommand_state_qa-local";
      let onDisk = false;
      try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key) || "";
        const parsed = raw ? JSON.parse(raw) : null;
        onDisk = Array.isArray(parsed?.shifts) && parsed.shifts.some((s) =>
          String(s.driverName || "") === "Import CTA Driver"
          && String(s.date || "") === iso
          && String(s.type || "") === "vacation"
        );
      } catch {
        onDisk = false;
      }
      return { inMemory, onDisk };
    }, dateStr);
    expect(persisted.inMemory).toBeTruthy();
    expect(persisted.onDisk).toBeTruthy();

    // Soft UI re-open only (not page.reload — QA initScript would re-seed).
    await page.evaluate(() => {
      if (typeof window.backFromPlanFullPage === "function") window.backFromPlanFullPage();
      window.state.activeGroupHubId = "101";
      if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
    });
    await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/);

    const afterUiReopen = await page.evaluate((iso) => {
      const shifts = window.state.shifts || [];
      return shifts.some((s) =>
        String(s.driverName || "") === "Import CTA Driver"
        && String(s.date || "") === iso
        && String(s.type || "") === "vacation"
      );
    }, dateStr);
    expect(afterUiReopen).toBeTruthy();
  });
});
