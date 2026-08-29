const { test, expect } = require("@playwright/test");
const { minimalDemoState, seedDemoState, loginDispatcher } = require("./helpers.js");

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function baseState() {
  const date = todayIso();
  return {
    ...minimalDemoState(),
    drivers: [
      {
        id: "drv-luka",
        name: "Luka Kovačević",
        groupId: "101",
        lineId: "101",
        active: true,
        bus: "BUS-101",
        email: "luka@example.test",
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
      { id: "bus-101", number: "BUS-101", groupId: "101", lineId: "101", active: true }
    ],
    shifts: [
      {
        id: `shf-luka-${date}`,
        driverId: "drv-luka",
        driverName: "Luka Kovačević",
        date,
        type: "morning",
        name: "101.S01",
        routeCode: "101.S01",
        bus: "BUS-101",
        start: "05:15",
        end: "13:15",
        revision: 1
      }
    ],
    reports: []
  };
}

test.describe("Unavailable driver incident workflow and resolution", () => {
  test("reporting driver unavailable preserves plan data and adds attention card with available-again action", async ({ page }) => {
    const date = todayIso();
    await seedDemoState(page, baseState());
    await page.goto("/staff.html");
    await loginDispatcher(page);

    // Initial shift exists
    const initialShift = await page.evaluate((d) =>
      window.state.shifts.find((s) => s.driverId === "drv-luka" && s.date === d),
      date
    );
    expect(initialShift).toBeDefined();
    expect(initialShift.type).toBe("morning");
    expect(initialShift.bus).toBe("BUS-101");

    // 1. Report driver unavailable
    await page.evaluate(() => {
      window.openOperationalIncident("drv-luka");
    });
    await expect(page.locator("#ops-incident-modal")).toBeVisible();
    await page.locator("#ops-incident-reason-code").selectOption("sick");
    await page.locator("#ops-incident-modal button[type='submit']").click();

    // 2. Plan data MUST remain preserved (not silently deleted or cleared)
    const shiftAfterReport = await page.evaluate((d) =>
      window.state.shifts.find((s) => s.driverId === "drv-luka" && s.date === d),
      date
    );
    expect(shiftAfterReport).toBeDefined();
    expect(shiftAfterReport.type).toBe("morning");
    expect(shiftAfterReport.bus).toBe("BUS-101");

    // 3. Attention panel shows coverage card with 'Vozač je ponovo dostupan' button
    await expect(page.locator("#ops-attention-panel")).toBeVisible();
    const coverageCard = page.locator(".ops-attention-card").filter({ hasText: /unavailable|nedostupan|nicht verfügbar|Luka Kovačević/i }).first();
    await expect(coverageCard).toBeVisible();

    const availBtn = coverageCard.locator(".ops-attention-available-again");
    await expect(availBtn).toBeVisible();
    await expect(availBtn).toContainText(/Vozač je ponovo dostupan|Driver is available again|Fahrer ist wieder verfügbar/i);

    // 4. Click 'Vozač je ponovo dostupan' to resolve without replacement
    await availBtn.click();

    // 5. Card disappears, success toast appears, report marked resolved
    await expect.poll(async () => page.evaluate(() =>
      window.state.reports.find((r) => r.driverId === "drv-luka")?.status
    )).toBe("resolved");

    await expect(page.locator('.ops-attention-card[data-attn-id^="coverage:"]').filter({ hasText: /Luka Kova\u010devi\u0107/i })).toHaveCount(0);

    // 6. Plan data remains 100% UNCHANGED
    const shiftAfterResolve = await page.evaluate((d) =>
      window.state.shifts.find((s) => s.driverId === "drv-luka" && s.date === d),
      date
    );
    expect(shiftAfterResolve).toBeDefined();
    expect(shiftAfterResolve.type).toBe("morning");
    expect(shiftAfterResolve.bus).toBe("BUS-101");
    expect(shiftAfterResolve.driverId).toBe("drv-luka");
  });

  test("duplicate active coverage incidents are collapsed into single card and resolved together", async ({ page }) => {
    const date = todayIso();
    const state = baseState();
    // Seed 2 duplicate active coverage reports for Luka
    state.reports = [
      {
        id: "rep-luka-dup-1",
        type: "coverage:disruption",
        status: "open",
        date,
        driverId: "drv-luka",
        driver: "Luka Kovačević",
        groupId: "101",
        bus: "BUS-101",
        reason: "Driver unavailable",
        createdAt: new Date().toISOString()
      },
      {
        id: "rep-luka-dup-2",
        type: "coverage:disruption",
        status: "open",
        date,
        driverId: "drv-luka",
        driver: "Luka Kovačević",
        groupId: "101",
        bus: "BUS-101",
        reason: "Driver unavailable",
        createdAt: new Date().toISOString()
      }
    ];

    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    // Open attention panel
    await page.evaluate(() => {
      window.openOpsAttentionPanel();
    });
    await expect(page.locator("#ops-attention-panel")).toBeVisible();

    // Deduplication check: Only 1 visible coverage item for Luka Kovačević despite 2 duplicate reports in state
    const navItems = page.locator("#ops-attention-nav .ops-attention-nav-item").filter({ hasText: /Vozač nedostupan|Driver unavailable|Fahrer nicht verfügbar/i });
    await expect(navItems).toHaveCount(1);

    // Resolve via 'Vozač je ponovo dostupan'
    const availBtn = page.locator(".ops-attention-card .ops-attention-available-again").first();
    await expect(availBtn).toBeVisible();
    await availBtn.click();

    // Both reports in state should now be resolved
    await expect.poll(async () => page.evaluate(() => {
      const lukaReports = (window.state.reports || []).filter((r) => r.driverId === "drv-luka");
      return lukaReports.every((r) => r.status === "resolved");
    })).toBe(true);

    // Attention panel clears Luka's card
    await expect(page.locator('.ops-attention-card[data-attn-id^="coverage:"]').filter({ hasText: /Luka Kova\u010devi\u0107/i })).toHaveCount(0);
  });

  test("coverage resolver modal includes distinct available-again action", async ({ page }) => {
    const date = todayIso();
    const state = baseState();
    state.reports = [
      {
        id: "rep-luka-cov-1",
        type: "coverage:disruption",
        status: "open",
        date,
        driverId: "drv-luka",
        driver: "Luka Kovačević",
        groupId: "101",
        bus: "BUS-101",
        reason: "Driver unavailable",
        createdAt: new Date().toISOString()
      }
    ];

    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);

    // Open coverage resolver modal directly
    await page.evaluate(() => {
      window.openCoverageResolver("rep-luka-cov-1");
    });
    const modal = page.locator("#ops-coverage-resolver-modal");
    await expect(modal).toBeVisible();

    const availModalBtn = modal.locator(".ops-coverage-available-again");
    await expect(availModalBtn).toBeVisible();
    await expect(availModalBtn).toContainText(/Vozač je ponovo dostupan|Driver is available again|Fahrer ist wieder verfügbar/i);

    // Click available-again in modal
    await availModalBtn.click();

    // Modal closes and report is resolved
    await expect(modal).toBeHidden();
    await expect.poll(async () => page.evaluate(() =>
      window.state.reports.find((r) => r.id === "rep-luka-cov-1")?.status
    )).toBe("resolved");
  });
});
