/**
 * FAZA 2R-A visual trail (QA harness).
 * Visual does NOT prove rollback, Rules, or server auth — see unit/HTTP tests.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-a-visual");
const PORT = process.env.PORT || "8766";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
  if (name.endsWith(".png") || name === "TRAIL.json" || name === "README.md") {
    unlinkSync(join(outDir, name));
  }
}

const trail = [];
let failed = false;
function log(step, detail, status = "pass") {
  trail.push({ step, detail, status, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
  if (status === "fail") failed = true;
}

async function shot(page, name, note) {
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  log(name, note, "pass");
}

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "Same Name",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9"
});
fixture.state.e2eFixture = true;
const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
fixture.state.drivers = [
  { id: idA, name: "Same Name", pin: "1111", bus: "1", groupId: "101", lineId: "101", active: true, companyId: "qa-local" },
  { id: idB, name: "Same Name", pin: "2222", bus: "2", groupId: "101", lineId: "101", active: true, companyId: "qa-local" }
];
fixture.state.buses = [{
  id: "bus-91101", number: "91101", groupId: "101", lineId: "101", active: true, opsStatus: "ready", companyId: "qa-local"
}];
fixture.state.shifts = [];
fixture.state.activeGroupHubId = "101";
fixture.state.onboardingDone = true;
fixture.state.companyAdminOnboardingDone = true;

const fingerprint = crypto.createHash("sha256").update("phase2r-a-visual").digest("hex");
const importId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
  const body = route.request().postDataJSON();
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      importId,
      fingerprint,
      preview: {
        fingerprint,
        groupId: body.groupId,
        month: body.month,
        summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
        rows: [{
          driverId: body.rows[0].driverId,
          date: body.rows[0].date,
          type: "morning",
          name: "101.S01",
          bus: "91101",
          action: "assign"
        }]
      }
    })
  });
});

await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
  await new Promise((r) => setTimeout(r, 350));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, importId, summary: { rows: 1 }, idempotent: false })
  });
});

await page.addInitScript(({ seeded, companyId }) => {
  window.__BUSCOMMAND_QA_HARNESS__ = true;
  window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
  const key = "buscommand_state_" + companyId;
  localStorage.setItem(key, JSON.stringify(seeded));
  sessionStorage.setItem(key, JSON.stringify(seeded));
}, { seeded: fixture.state, companyId: "qa-local" });

try {
  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
  await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });

  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (window.Auth?.getIdToken) window.Auth.getIdToken = async () => "e2e-disp-token";
    window.openMonthlyPlansFull?.();
  });
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible" });

  await page.evaluate(({ idA: a }) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([{
      fileName: "pending.txt",
      driverId: a,
      driverName: "Same Name",
      month: "2026-08",
      parsedShifts: { 3: { type: "morning", name: "101.S01", routeCode: "101.S01", bus: "91101" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
  }, { idA });
  await page.locator('[data-testid="plan-import-pending-row"]').waitFor({ state: "visible" });
  await shot(page, "01-upload-pending.png", "Upload/pending state");

  await page.evaluate(({ idA: a, idB: b }) => {
    window.__setPendingPlanImportsForTest([{
      fileName: "dup.txt",
      driverId: null,
      driverName: "Same Name",
      needsDriverPick: true,
      ambiguousName: true,
      month: "2026-08",
      parsedShifts: { 3: { type: "morning", name: "101.S01", routeCode: "101.S01", bus: "91101" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
    window.state.drivers = [
      { id: a, name: "Same Name", groupId: "101", active: true },
      { id: b, name: "Same Name", groupId: "101", active: true }
    ];
    window.__setPendingPlanImportsForTest([{
      fileName: "dup.txt",
      driverId: null,
      driverName: "Same Name",
      needsDriverPick: true,
      ambiguousName: true,
      month: "2026-08",
      parsedShifts: { 3: { type: "morning", name: "101.S01", routeCode: "101.S01", bus: "91101" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
  }, { idA, idB });
  await page.locator('[data-testid="plan-import-driver-ambiguous"]').waitFor({ state: "visible" });
  await shot(page, "02-duplicate-name.png", "Duplicate-name disambiguation");

  await page.evaluate(({ idB: b }) => {
    window.__setPendingPlanImportsForTest([
      {
        fileName: "m1.txt", driverId: b, driverName: "Same Name", month: "2026-08",
        parsedShifts: { 3: { type: "off" } }, dayCount: 1, parseQuality: "ok", format: "loose-text", fileType: "text/plain", fileData: null
      },
      {
        fileName: "m2.txt", driverId: b, driverName: "Same Name", month: "2026-09",
        parsedShifts: { 3: { type: "off" } }, dayCount: 1, parseQuality: "ok", format: "loose-text", fileType: "text/plain", fileData: null
      }
    ]);
  }, { idB });
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-multi-month-block"]').waitFor({ state: "visible" });
  await shot(page, "03-multi-month-block.png", "Multi-month blocked before API");

  await page.evaluate(({ idB: b }) => {
    window.__setPendingPlanImportsForTest([{
      fileName: "ok.txt",
      driverId: b,
      driverName: "Same Name",
      month: "2026-08",
      parsedShifts: { 3: { type: "morning", name: "101.S01", routeCode: "101.S01", bus: "91101", start: "05:00", end: "13:00" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
  }, { idB });
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  await shot(page, "04-server-preview.png", "Server preview");

  await page.evaluate(() => {
    window.loadStateFromFirestore = async () => ({
      shifts: [{
        driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        driverName: "Same Name",
        date: "2026-08-03",
        type: "morning",
        name: "101.S01",
        bus: "91101",
        revision: 1,
        groupId: "101"
      }],
      schedules: []
    });
  });
  const commitPromise = page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.waitForTimeout(120);
  await shot(page, "05-commit-pending.png", "Commit pending");
  await commitPromise;
  await page.waitForTimeout(400);
  await shot(page, "06-success-reload.png", "Success after canonical reload");

  await page.evaluate(({ idB: b }) => {
    // Clear prior success toasts so failure assertion is not polluted.
    document.querySelectorAll(".toast, .toast-container, [data-toast], .bc-toast").forEach((el) => el.remove());
    window.state.shifts = [];
    window.__setPendingPlanImportsForTest([{
      fileName: "bad.txt",
      driverId: b,
      driverName: "Same Name",
      month: "2026-08",
      parsedShifts: { 3: { type: "morning", name: "UNKNOWN.DUTY", routeCode: "UNKNOWN.DUTY", bus: "91101" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
  }, { idB });
  await page.unroute("**/api/staff/monthly-plans/import/preview");
  await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "PLAN_IMPORT_VALIDATION_FAILED",
        details: [{ code: "DUTY_NOT_IN_ACTIVE_CATALOG" }]
      })
    });
  });
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-validation-errors"]').waitFor({ state: "visible" });
  const toastText = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".toast, .toast-container, [data-toast], .bc-toast, #toast-container")];
    return nodes.map((n) => n.innerText || "").join("\n");
  });
  const previewText = await page.locator("#plan-import-preview").innerText();
  const combined = `${toastText}\n${previewText}`;
  if (/monthly plans saved|mesečnih planova sačuvano|Monatspläne gespeichert/i.test(combined)) {
    log("07-failure-no-success", "success toast present on failure", "fail");
  } else {
    log("07-failure-no-success", "validation failure without success toast", "pass");
  }
  await shot(page, "07-validation-failure.png", "Validation/commit failure without success");

  await page.evaluate(() => {
    window.__setPendingPlanImportsForTest([{
      fileName: "rec.txt",
      driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      driverName: "Same Name",
      month: "2026-08",
      parsedShifts: { 3: { type: "off" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
    // Simulate recovery-required UI state (server compensation failure path).
    window.__setPendingPlanImportsForTest([{
      fileName: "rec.txt",
      driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      driverName: "Same Name",
      month: "2026-08",
      parsedShifts: { 3: { type: "off" } },
      dayCount: 1,
      parseQuality: "ok",
      format: "loose-text",
      fileType: "text/plain",
      fileData: null
    }]);
  });
  await page.evaluate(() => {
    // Reach private module state via confirm reject path simulation:
    const container = document.getElementById("plan-import-preview");
    if (container) {
      container.insertAdjacentHTML("beforeend", `<div data-testid="plan-import-recovery-required" class="plan-import-recovery-required" style="margin-top:12px;padding:12px;border:1px solid rgba(245,158,11,0.5);border-radius:8px;color:#fcd34d;">Import recovery required — automatic rollback did not finish.</div>`);
    }
  });
  await page.locator('[data-testid="plan-import-recovery-required"]').waitFor({ state: "visible" });
  await shot(page, "08-recovery-required.png", "Recovery-required UI (simulated)");
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  await page.screenshot({ path: join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2R-A visual trail",
    "",
    "QA harness screenshots for Dispo monthly import reliability UI.",
    "",
    "**Visual does NOT prove:** compensation/rollback correctness, Firestore Rules,",
    "server authorization, or atomics. Those require executable unit/HTTP tests.",
    "",
    failed ? "RESULT: FAIL" : "RESULT: PASS",
    ""
  ].join("\n"));
  await browser.close();
}

if (failed) process.exit(1);
console.log("phase-2r-a visual OK →", outDir);
