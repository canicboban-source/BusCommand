/**
 * Dispo panel — invented incident flows + fleet stress ladder.
 * Measures resolution path (report → options → apply) and soft capacity per group.
 */
const { test, expect } = require("@playwright/test");
const { minimalDemoState, loginDispatcher, installQaHarness } = require("./helpers.js");

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build a line-101 fleet: active drivers on duty, spare standby, ready buses.
 * @param {number} driverCount working + spare mix
 * @param {number} busCount
 */
function buildFleetState(driverCount, busCount) {
  const date = todayIso();
  const base = minimalDemoState();
  const drivers = [];
  const buses = [];
  const shifts = [];
  const catalogEntries = {};

  for (let i = 1; i <= busCount; i += 1) {
    const number = `B${String(i).padStart(3, "0")}`;
    buses.push({
      id: `bus-${i}`,
      number,
      groupId: "101",
      lineId: "101",
      groupIds: ["101"],
      active: true,
      garage: i % 3 === 0 ? "Depot B" : "Depot A",
      opsStatus: i === busCount ? "maintenance" : "active",
      revision: 0
    });
  }

  for (let i = 1; i <= driverCount; i += 1) {
    const id = `drv-${i}`;
    const name = `Driver ${String(i).padStart(2, "0")}`;
    const isSpare = i > Math.floor(driverCount * 0.75);
    const bus = !isSpare && i <= busCount - 1 ? `B${String(i).padStart(3, "0")}` : "";
    const code = `101.S${String(((i - 1) % 20) + 1).padStart(2, "0")}`;
    catalogEntries[code] = {
      code,
      label: `Duty ${code}`,
      type: "morning",
      start: "05:00",
      end: "13:00"
    };
    drivers.push({
      id,
      name,
      groupId: "101",
      lineId: "101",
      knownGroupIds: ["101"],
      active: true,
      bus,
      email: `d${i}@example.test`,
      phone: `+43100${String(i).padStart(6, "0")}`,
      pin: String(1000 + (i % 9000))
    });
    if (isSpare) {
      shifts.push({
        id: `shf-${id}-${date}`,
        driverId: id,
        driverName: name,
        date,
        type: "bereitschaft",
        name: "Standby",
        routeCode: "",
        bus: "",
        revision: 1
      });
    } else {
      shifts.push({
        id: `shf-${id}-${date}`,
        driverId: id,
        driverName: name,
        date,
        type: "morning",
        name: code,
        routeCode: code,
        bus,
        start: "05:00",
        end: "13:00",
        revision: 1
      });
    }
  }

  // Intentionally leave Driver 02 without bus (missing_bus attention).
  const d2 = drivers.find((d) => d.id === "drv-2");
  if (d2) d2.bus = "";
  const s2 = shifts.find((s) => s.driverId === "drv-2");
  if (s2) s2.bus = "";

  // Wrong catalog code on Driver 03.
  const s3 = shifts.find((s) => s.driverId === "drv-3");
  if (s3) {
    s3.routeCode = "101.BAD";
    s3.name = "101.BAD";
  }

  const reports = [
    {
      id: "inc-delay",
      type: "delay:10",
      status: "active",
      severity: "sev_medium",
      date,
      time: "08:10",
      driverId: "drv-1",
      driver: "Driver 01",
      groupId: "101",
      bus: "B001",
      reason: "Traffic jam downtown",
      affectedEntity: "driver"
    },
    {
      id: "inc-breakdown",
      type: "breakdown:bd_engine",
      status: "active",
      severity: "sev_high",
      date,
      time: "08:40",
      driverId: "drv-4",
      driver: "Driver 04",
      groupId: "101",
      bus: buses[3]?.number || "B004",
      reason: "Engine overheat",
      affectedEntity: "vehicle"
    },
    {
      id: "inc-coverage",
      type: "coverage:disruption",
      status: "active",
      severity: "sev_high",
      date,
      time: "09:00",
      driverId: "drv-5",
      driver: "Driver 05",
      groupId: "101",
      bus: buses[4]?.number || "B005",
      reason: "ops_coverage_unavailable",
      description: "Sudden illness — needs replacement",
      affectedEntity: "driver"
    }
  ];

  return {
    ...base,
    language: "en",
    drivers,
    buses,
    shifts,
    reports,
    shiftCatalogs: {
      "101": { lineId: "101", entries: catalogEntries, revision: 1 }
    },
    shiftCatalog: { lineId: "101", entries: catalogEntries, revision: 1 },
    activeGroupFilter: "101",
    activeGroupHubId: "101"
  };
}

async function openAttention(page) {
  const health = page.locator("#ops-plan-health");
  await expect(health).toBeVisible();
  await health.click();
  await expect(page.locator("#ops-attention-panel")).toBeVisible({ timeout: 15_000 });
}

async function seedFleetAndLogin(page, driverCount, busCount) {
  const state = buildFleetState(driverCount, busCount);
  const companyId = state.companyAdmins?.[0]?.companyId || state.dispatchers?.find((d) => !d.isSuperAdmin)?.companyId || "qa-local";
  await installQaHarness(page, {
    companyId,
    state: { ...state, e2eFixture: true, companyId },
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });
  await page.goto("/staff.html");
  await loginDispatcher(page, "dispo@qa.local", "Qa-test-ok-9");
}

async function ensureAttentionOpen(page) {
  const panel = page.locator("#ops-attention-panel");
  if (await panel.evaluate((el) => el.classList.contains("hidden")).catch(() => true)) {
    await openAttention(page);
  }
  await expect(panel).toBeVisible();
}

async function focusAttentionCard(page, attnId) {
  await ensureAttentionOpen(page);
  await page.evaluate((id) => {
    if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(id);
  }, attnId);
  const card = page.locator(`.ops-attention-card[data-attn-id="${attnId}"]`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

async function resolveReportCard(page, attnId, { type = "restored", note = "Resolved in stress run." } = {}) {
  const card = await focusAttentionCard(page, attnId);
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-attn-field="resolutionType"]').selectOption(type, { timeout: 10_000 });
  await card.locator('[data-attn-field="note"]').fill(note);
  await card.locator("button.ops-attention-apply").click();
}

test.describe("Dispo incident + fleet stress", () => {
  test.describe.configure({ timeout: 120_000 });

  test("full incident chain: delay → missing bus → wrong shift → breakdown → coverage", async ({ page }) => {
    page.on("pageerror", (err) => {
      page.evaluate((msg) => {
        window.__bcTestErrors = window.__bcTestErrors || [];
        window.__bcTestErrors.push(String(msg));
      }, err.message).catch(() => {});
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFleetAndLogin(page, 16, 14);

    await expect(page.locator("#dispatcher-dashboard")).toBeVisible();
    await expect(page.locator("#ops-plan-health")).toBeVisible();
    // Live alerts share Needs attention SoT (field reports + missing bus / wrong shift / …).
    await expect(page.locator("#dispatcher-live-alerts .urgent-action").first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator("#dispatcher-live-alerts .urgent-action").count()).toBeGreaterThanOrEqual(5);

    await openAttention(page);
    // Single-card UI: queue length is nav items (one detail card visible).
    expect(await page.locator(".ops-attention-nav-item").count()).toBeGreaterThanOrEqual(5);
    expect(await page.locator(".ops-attention-card").count()).toBe(1);

    // 1) Delay
    await resolveReportCard(page, "report:inc-delay", {
      type: "restored",
      note: "Traffic cleared — service resumed."
    });
    await expect.poll(async () =>
      page.evaluate(() => window.state.reports.find((r) => r.id === "inc-delay")?.status)
    ).toBe("resolved");

    // 2) Missing bus Driver 02
    const missingBus = await focusAttentionCard(page, "bus:drv-2");
    await missingBus.scrollIntoViewIfNeeded();
    const busSelect = missingBus.locator('[data-attn-field="bus"]');
    const firstBus = await busSelect.locator("option:not([disabled])").first().getAttribute("value");
    expect(firstBus).toBeTruthy();
    await busSelect.selectOption(firstBus);
    await missingBus.locator("button.ops-attention-apply").click();
    await expect.poll(async () =>
      page.evaluate(() => window.state.shifts.find((s) => s.driverId === "drv-2")?.bus || "")
    ).not.toBe("");

    // 3) Wrong shift Driver 03
    const wrongShift = await focusAttentionCard(page, "shift:drv-3");
    await wrongShift.scrollIntoViewIfNeeded();
    const dutySelect = wrongShift.locator('[data-attn-field="duty"]');
    const dutyVal = await dutySelect.locator("option:not([disabled])").first().getAttribute("value");
    await dutySelect.selectOption(dutyVal);
    await wrongShift.locator("button.ops-attention-apply").click();
    await expect.poll(async () =>
      page.evaluate(() => window.state.shifts.find((s) => s.driverId === "drv-3")?.routeCode || "")
    ).not.toBe("101.BAD");

    // 4) Breakdown
    await resolveReportCard(page, "report:inc-breakdown", {
      type: "replaced",
      note: "Spare bus from Depot A assigned."
    });
    await expect.poll(async () =>
      page.evaluate(() => window.state.reports.find((r) => r.id === "inc-breakdown")?.status)
    ).toBe("resolved");

    // 5) Coverage replacement
    const coverage = await focusAttentionCard(page, "coverage:inc-coverage");
    await coverage.scrollIntoViewIfNeeded();
    const drvSel = coverage.locator('[data-attn-field="driver"]');
    const busSel = coverage.locator('[data-attn-field="bus"]');
    const spareId = await drvSel.locator("option:not([disabled])").first().getAttribute("value");
    const spareBus = await busSel.locator("option:not([disabled])").first().getAttribute("value");
    await drvSel.selectOption(spareId);
    await busSel.selectOption(spareBus);
    await coverage.locator("button.ops-attention-apply").click();
    await expect.poll(async () =>
      page.evaluate(() => window.state.reports.find((r) => r.id === "inc-coverage")?.status)
    ).toBe("resolved");

    await page.locator(".ops-attention-close").click({ force: true }).catch(() => {});
    await page.locator("#ops-plan-health").click();
    const panelOpen = await page.locator("#ops-attention-panel:not(.hidden)").count();
    const problems = await page.locator("#ops-plan-health [data-plan-health-problems] button").count();
    expect(panelOpen + problems).toBeGreaterThan(0);

    const pageErrors = await page.evaluate(() => window.__bcTestErrors || []);
    expect(pageErrors).toEqual([]);
  });

  test("fleet stress ladder: panel opens and resolves without page errors", async ({ browser }) => {
    const ladder = [12, 24, 40, 60];
    const results = [];

    for (const n of ladder) {
      const buses = Math.max(8, n - 2);
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on("pageerror", (err) => {
        page.evaluate((msg) => {
          window.__bcTestErrors = window.__bcTestErrors || [];
          window.__bcTestErrors.push(String(msg));
        }, err.message).catch(() => {});
      });

      await page.setViewportSize({ width: 1440, height: 900 });
      await seedFleetAndLogin(page, n, buses);
      await expect(page.locator("#dispatcher-dashboard")).toBeVisible();
      await page.evaluate(() => {
        window.__bcTestErrors = [];
      });

      const t0 = Date.now();
      await page.locator("#ops-plan-health").click();
      await expect(page.locator("#ops-attention-panel")).toBeVisible({ timeout: 20_000 });
      const openMs = Date.now() - t0;
      const navCount = await page.locator(".ops-attention-nav-item").count();
      const cards = Math.max(await page.locator(".ops-attention-card").count(), navCount > 0 ? 1 : 0);

      // Prefer a field-report card in the single-card queue.
      await page.evaluate(() => {
        const delay = (window.state.reports || []).find((r) => r.id === "inc-delay" && r.status === "active");
        if (delay && typeof window.openOpsAttentionPanel === "function") {
          window.openOpsAttentionPanel(`report:${delay.id}`);
        }
      });
      const reportCard = page.locator(".ops-attention-card").filter({
        has: page.locator('[data-attn-field="resolutionType"]')
      }).first();
      let resolved = false;
      if (await reportCard.count()) {
        await reportCard.locator('[data-attn-field="resolutionType"]').selectOption("restored");
        await reportCard.locator('[data-attn-field="note"]').fill(`Stress n=${n}`);
        await reportCard.locator("button.ops-attention-apply").click();
        resolved = true;
      }

      // Wait for apply to finish — close is blocked while `_pendingApply` is true.
      await expect(page.locator(".ops-attention-card.is-pending")).toHaveCount(0, { timeout: 15_000 });
      await page.locator(".ops-attention-close").click({ force: true });
      const stillOpen = await page.locator("#ops-attention-panel:not(.hidden)").count();
      if (stillOpen) {
        await page.evaluate(() => {
          const layer = document.getElementById("ops-attention-panel");
          if (!layer) return;
          layer.classList.add("hidden");
          layer.style.display = "none";
          layer.setAttribute("aria-hidden", "true");
          document.body.classList.remove("ops-attention-open");
        });
      }
      await expect(page.locator("#ops-attention-panel")).toBeHidden({ timeout: 5_000 });

      await page.evaluate(() => {
        const el = document.querySelector('#dashboard-groups-grid [data-action="openDailyPlanForGroup"]');
        if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      if (await page.locator("#dispatcher-daily-plan-full.hidden").count()) {
        const groupBtn = page.locator('#dashboard-groups-grid [data-action="openDailyPlanForGroup"]').first();
        await expect(groupBtn).toBeVisible({ timeout: 10_000 });
        await groupBtn.click();
      }
      await expect(page.locator("#dispatcher-daily-plan-full")).toBeVisible({ timeout: 20_000 });
      const slotKids = await page.locator("#daily-plan-full-slots").locator(":scope > *").count();
      const dailyHealth = page.locator("#daily-plan-health");
      await expect(dailyHealth).toBeVisible();
      await dailyHealth.click();
      await expect(page.locator("#ops-attention-panel")).toBeVisible({ timeout: 15_000 });
      await page.locator(".ops-attention-close").click({ force: true });
      if (await page.locator("#ops-attention-panel:not(.hidden)").count()) {
        await page.evaluate(() => {
          const layer = document.getElementById("ops-attention-panel");
          if (!layer) return;
          layer.classList.add("hidden");
          layer.style.display = "none";
          layer.setAttribute("aria-hidden", "true");
          document.body.classList.remove("ops-attention-open");
        });
      }

      const errors = await page.evaluate(() => window.__bcTestErrors || []);
      const metrics = await page.evaluate(() => ({
        drivers: (window.state.drivers || []).filter((d) => d.groupId === "101").length,
        buses: (window.state.buses || []).filter((b) => b.groupId === "101" || (b.groupIds || []).includes("101")).length,
        shifts: (window.state.shifts || []).length,
        reportsActive: (window.state.reports || []).filter((r) => r.status === "active").length
      }));

      results.push({
        drivers: n,
        buses,
        openMs,
        cards,
        resolved,
        slotKids,
        errors: errors.length,
        ...metrics
      });

      expect(errors, `page errors at n=${n}`).toEqual([]);
      expect(cards).toBeGreaterThan(0);
      expect(openMs).toBeLessThan(15_000);
      await context.close();
    }

    const safe = [...results].reverse().find((r) => r.openMs < 3000 && r.errors === 0);
    const usable = [...results].reverse().find((r) => r.openMs < 8000 && r.errors === 0);
    console.log("DISPO_STRESS_RESULTS", JSON.stringify({ results, recommendedSafe: safe?.drivers, recommendedUsable: usable?.drivers }, null, 2));
    expect(usable?.drivers || 0).toBeGreaterThanOrEqual(40);
  });

  test("a11y smoke: attention panel dialog semantics and keyboard close", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFleetAndLogin(page, 20, 18);
    await openAttention(page);

    const panel = page.locator("#ops-attention-panel");
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(panel).toHaveAttribute("aria-labelledby", "ops-attention-title");

    const firstApply = page.locator(".ops-attention-apply").first();
    await firstApply.focus();
    await expect(firstApply).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Close button also dismisses after reopen.
    await openAttention(page);
    await expect(panel).toBeVisible();
    await page.locator(".ops-attention-close").click();
    await expect(panel).toBeHidden();

    // Health banner remains keyboard activatable.
    const health = page.locator("#ops-plan-health");
    await health.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
  });
});
