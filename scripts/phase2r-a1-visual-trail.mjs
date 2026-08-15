/**
 * FAZA 2R-A.1 visual trail — real UI states only (no insertAdjacentHTML simulation).
 * Visual proves UI path only. Server rollback/lock/auth require executable tests.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-a1-visual");
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
function log(step, detail, status = "pass", screenshot = null) {
  trail.push({ step, detail, status, screenshot, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
  if (status === "fail") failed = true;
}

async function shot(page, name, note, assertionOk) {
  if (!assertionOk) {
    log(name, `assertion failed before screenshot: ${note}`, "fail", null);
    await page.screenshot({ path: join(outDir, `FAIL-${name}`), fullPage: false }).catch(() => {});
    return false;
  }
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  log(name, note, "pass", name);
  return true;
}

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "Visual Driver",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9"
});
fixture.state.e2eFixture = true;
fixture.state.activeGroupHubId = "101";
fixture.state.onboardingDone = true;
fixture.state.companyAdminOnboardingDone = true;

const fingerprint = crypto.createHash("sha256").update("phase2r-a1-visual").digest("hex");
const importId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

  const pending = {
    fileName: "visual.txt",
    driverId: fixture.state.drivers[0].id,
    driverName: "Visual Driver",
    month: "2026-08",
    parsedShifts: {
      3: { type: "morning", name: "101.S01", routeCode: "101.S01", bus: "91101", start: "05:00", end: "13:00" }
    },
    dayCount: 1,
    parseQuality: "ok",
    format: "loose-text",
    fileType: "text/plain",
    fileData: null
  };

  // 1) Preview network failure — retry enabled
  await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
    await route.abort("failed");
  });
  await page.evaluate((item) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([item]);
  }, pending);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-preview-transport-failed"]').waitFor({ state: "visible", timeout: 10000 });
  const retryEnabled = await page.locator('[data-testid="plan-import-server-preview-btn"]').isEnabled();
  await shot(page, "01-preview-network-failure.png", "Preview network failure — retry enabled", retryEnabled);

  // 2) Real commit pending — phase committing + Committing…
  await page.unroute("**/api/staff/monthly-plans/import/preview");
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
          summary: { rows: 1 },
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
  let releaseCommit;
  const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
  await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
    await commitGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, importId, summary: { rows: 1 }, idempotent: false })
    });
  });
  await page.evaluate((item) => {
    window.__setPendingPlanImportsForTest([item]);
  }, pending);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  const commitClick = page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="plan-import-phase"]');
    return el && el.getAttribute("data-plan-import-phase") === "committing";
  }, null, { timeout: 8000 });
  const phaseAttr = await page.locator('[data-testid="plan-import-phase"]').getAttribute("data-plan-import-phase");
  const committingText = await page.locator('[data-testid="plan-import-confirm-commit-btn"], [data-testid="plan-import-retry-commit-btn"]').first().innerText().catch(() => "");
  const pendingOk = phaseAttr === "committing"
    && /Committing|Upis|Wird gespeichert|Validating|Validacija/i.test(`${committingText}`);
  await shot(page, "02-commit-pending.png", `Commit pending — phase=${phaseAttr} btn="${committingText.trim()}"`, pendingOk);
  await page.evaluate(() => {
    window.loadStateFromFirestore = async () => ({
      shifts: [{
        driverId: "11111111-1111-4111-8111-111111111111",
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
  releaseCommit();
  await commitClick;
  await page.waitForTimeout(400);

  async function resetPendingAndPreview() {
    await page.evaluate((item) => {
      window.state.shifts = [];
      window.__setPendingPlanImportsForTest([item]);
    }, pending);
    await page.locator('[data-testid="plan-import-pending-row"]').waitFor({ state: "visible", timeout: 10000 });
    const previewBtn = page.locator('[data-testid="plan-import-server-preview-btn"]');
    await previewBtn.waitFor({ state: "visible", timeout: 10000 });
    await expectEnabled(previewBtn);
    await previewBtn.click();
    await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible", timeout: 10000 });
  }

  async function expectEnabled(locator) {
    await locator.waitFor({ state: "attached" });
    for (let i = 0; i < 20; i += 1) {
      if (await locator.isEnabled()) return;
      await page.waitForTimeout(100);
    }
    if (!(await locator.isEnabled())) throw new Error("preview button stayed disabled");
  }

  // Reset for unknown path
  await page.unroute("**/api/staff/monthly-plans/import/commit").catch(() => {});
  let commitN = 0;
  await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
    commitN += 1;
    if (commitN === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, importId, summary: { rows: 1 }, idempotent: true })
    });
  });
  await resetPendingAndPreview();
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-commit-unknown"]').waitFor({ state: "visible", timeout: 10000 });
  const unknownBody = await page.locator("body").innerText();
  const unknownOk = unknownBody.includes(importId)
    && await page.locator('[data-testid="plan-import-retry-commit-btn"]').isVisible();
  await shot(page, "03-commit-unknown.png", "Commit outcome unknown — same importId + retry", unknownOk);

  await page.evaluate(() => {
    window.loadStateFromFirestore = async () => ({
      shifts: [{
        driverId: "11111111-1111-4111-8111-111111111111",
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
  await page.locator('[data-testid="plan-import-retry-commit-btn"]').click();
  await page.waitForTimeout(600);
  const afterRetry = await page.evaluate(() => (window.state.shifts || []).some((s) => s.date === "2026-08-03"));
  await shot(page, "04-idempotent-retry-success.png", "Idempotent retry success after canonical reload", afterRetry === true);

  // 5) Recovery-required via real API intercept (not DOM inject)
  await page.unroute("**/api/staff/monthly-plans/import/commit").catch(() => {});
  await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "MONTHLY_IMPORT_COMPENSATION_FAILED",
        recoveryRequired: true,
        error: "Uvoz nije potvrđen. Automatski povrat nije uspeo — potrebna je provera (recovery_required)."
      })
    });
  });
  await resetPendingAndPreview();
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-recovery-required"]').waitFor({ state: "visible", timeout: 10000 });
  const recoveryVisible = await page.locator('[data-testid="plan-import-recovery-required"]').isVisible();
  await shot(page, "05-recovery-required-api.png", "Recovery-required via real API intercept", recoveryVisible);
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  await page.screenshot({ path: join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2R-A.1 visual trail",
    "",
    "Real UI screenshots (no insertAdjacentHTML simulation).",
    "",
    "**Visual proves UI only.** Server rollback, durable locks, and authorization",
    "are proven by executable unit/HTTP tests — not by these screenshots.",
    "",
    "Prior 2R-A corrections noted:",
    "- visual 08 was simulated (superseded by 05-recovery-required-api.png)",
    "- visual 05 did not assert DOM phase=committing (fixed here as 02)",
    "",
    failed ? "RESULT: FAIL" : "RESULT: PASS",
    ""
  ].join("\n"));
  await browser.close();
}

if (failed) process.exit(1);
console.log("phase-2r-a1 visual OK →", outDir);
