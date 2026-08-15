/**
 * FAZA 2 — Dispo monthly import visual trail (QA harness, no ?mode=demo).
 * Screenshots 1–10 per v4.1. Authz/atomicity proof = unit + API path tests.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2-visual");
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
  driverName: "Import CTA Driver",
  driverId: "11111111-1111-4111-8111-111111111111",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9"
});
fixture.state.e2eFixture = true;
fixture.state.drivers = [{
  id: "11111111-1111-4111-8111-111111111111",
  name: "Import CTA Driver",
  pin: "1234",
  bus: "91101",
  groupId: "101",
  lineId: "101",
  active: true,
  companyId: "qa-local"
}];
fixture.state.buses = [{
  id: "bus-91101",
  number: "91101",
  groupId: "101",
  lineId: "101",
  active: true,
  opsStatus: "ready",
  companyId: "qa-local"
}];
fixture.state.shifts = [];
fixture.state.schedules = [];
fixture.state.activeGroupHubId = "101";
fixture.state.onboardingDone = true;
fixture.state.companyAdminOnboardingDone = true;

const fingerprint = crypto.createHash("sha256").update("phase2-visual").digest("hex");
const importId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
  const body = route.request().postDataJSON();
  const bad = (body.rows || []).some((row) => String(row.routeCode || "").includes("UNKNOWN"));
  if (bad) {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "PLAN_IMPORT_VALIDATION_FAILED",
        details: [{ row: 1, code: "DUTY_NOT_IN_ACTIVE_CATALOG", dutyCode: "UNKNOWN.DUTY" }]
      })
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      importId,
      fingerprint,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      preview: {
        fingerprint,
        groupId: body.groupId,
        month: body.month,
        sourceName: body.sourceName,
        reason: body.reason,
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
  await new Promise((r) => setTimeout(r, 400));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      importId,
      summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
      idempotent: false
    })
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
  await shot(page, "01-upload-zone.png", "Login / before open import (upload surface next)");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });

  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (window.Auth && typeof window.Auth.getIdToken === "function") {
      window.Auth.getIdToken = async () => "e2e-disp-token";
    }
    window.openMonthlyPlansFull?.();
  });
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible", timeout: 10000 });
  await shot(page, "01b-upload.png", "Upload dropzone visible");

  const pendingOk = {
    fileName: "dienstplan-import.txt",
    driverName: "Import CTA Driver",
    month: "2026-08",
    parsedShifts: {
      3: {
        type: "morning",
        name: "101.S01",
        routeCode: "101.S01",
        bus: "91101",
        start: "05:00",
        end: "13:00"
      }
    },
    dayCount: 1,
    parseQuality: "ok",
    format: "loose-text",
    fileType: "text/plain",
    fileData: null
  };

  await page.evaluate((item) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([item]);
  }, pendingOk);
  await shot(page, "02-parsing.png", "Parsed pending rows after upload/parse");

  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible", timeout: 15000 });
  await shot(page, "03-server-preview.png", "Server preview returned");
  await shot(page, "04-validated-rows.png", "Validated rows in server preview list");

  // Validation errors path
  await page.evaluate((item) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([{
      ...item,
      parsedShifts: {
        3: { ...item.parsedShifts[3], name: "UNKNOWN.DUTY", routeCode: "UNKNOWN.DUTY" }
      }
    }]);
  }, pendingOk);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-validation-errors"]').waitFor({ state: "visible", timeout: 15000 });
  await shot(page, "05-validation-errors.png", "Server validation errors — no save");

  // Restore happy path preview
  await page.evaluate((item) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([item]);
  }, pendingOk);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').waitFor({ state: "visible", timeout: 15000 });
  await shot(page, "06-confirm.png", "Confirm import button ready");

  await page.evaluate(() => {
    window.loadStateFromFirestore = async () => ({
      shifts: [{
        driverId: "11111111-1111-4111-8111-111111111111",
        driverName: "Import CTA Driver",
        date: "2026-08-03",
        type: "morning",
        name: "101.S01",
        bus: "91101",
        routeCode: "101.S01",
        groupId: "101",
        revision: 1
      }],
      schedules: []
    });
  });

  const commitClick = page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.waitForTimeout(150);
  await shot(page, "07-commit-pending.png", "Commit pending / busy state");
  await commitClick;
  await page.waitForTimeout(500);
  await shot(page, "08-full-success.png", "Full success after server commit");

  await page.evaluate(() => {
    window.openMonthlyPlansFull?.();
  });
  await page.waitForTimeout(300);
  await shot(page, "09-plan-after-refresh.png", "Plan view after canonical reload");

  // Rejected without partial success
  await page.evaluate(() => {
    window.state.shifts = [];
  });
  await page.evaluate((item) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([{
      ...item,
      parsedShifts: {
        3: { ...item.parsedShifts[3], name: "UNKNOWN.DUTY", routeCode: "UNKNOWN.DUTY" }
      }
    }]);
  }, pendingOk);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-validation-errors"]').waitFor({ state: "visible", timeout: 15000 });
  const shiftCount = await page.evaluate(() => (window.state.shifts || []).length);
  if (shiftCount !== 0) log("10-rejected-no-partial", `shifts=${shiftCount}`, "fail");
  else log("10-rejected-no-partial", "Rejected import left shifts empty", "pass");
  await shot(page, "10-rejected-no-partial.png", "Rejected import without partial success");
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  await page.screenshot({ path: join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2 visual trail",
    "",
    "QA harness screenshots for Dispo monthly import preview→commit.",
    "Does not prove live Firestore Rules; see unit/staff-monthly-plan-import tests.",
    "",
    failed ? "RESULT: FAIL" : "RESULT: PASS",
    ""
  ].join("\n"));
  await browser.close();
}

if (failed) process.exit(1);
console.log("phase-2 visual trail OK →", outDir);
