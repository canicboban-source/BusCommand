/**
 * FAZA 2R-A.2 visual trail — UI path only.
 * Screenshots do NOT prove server lock / rollback / auth (those are executable tests).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-a2-visual");
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

const fingerprint = crypto.createHash("sha256").update("phase2r-a2-visual").digest("hex");
const importId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const evilFile = "<img src=x onerror=alert(1)>";
const evilDuty = '"><svg onload=alert(1)>';

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
            driverId: body.rows?.[0]?.driverId || fixture.state.drivers[0].id,
            date: body.rows?.[0]?.date || "2026-08-03",
            type: "morning",
            name: body.rows?.[0]?.routeCode || "101.S01",
            bus: "91101",
            action: "assign"
          }]
        }
      })
    });
  });

  // 1) Commit in progress — UI keeps job; no parallel-commit / rollback claim
  await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "MONTHLY_IMPORT_IN_PROGRESS",
        retryable: true,
        recoveryRequired: false,
        compensated: false,
        error: "Uvoz se još obrađuje — pokušajte ponovo uskoro."
      })
    });
  });
  await page.evaluate((item) => {
    window.USE_LOCAL_STATE = false;
    window.__setPendingPlanImportsForTest([item]);
  }, pending);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-commit-in-progress"]').waitFor({ state: "visible", timeout: 10000 });
  const phase1 = await page.locator('[data-testid="plan-import-phase"]').getAttribute("data-plan-import-phase");
  const body1 = await page.locator("body").innerText();
  const inProgressOk = phase1 === "commit_in_progress"
    && body1.includes(importId)
    && !/rolled back|poništene|zurückgenommen/i.test(body1)
    && await page.locator('[data-testid="plan-import-retry-commit-btn"]').isVisible();
  await shot(
    page,
    "01-commit-in-progress.png",
    "IN_PROGRESS UI — same import retained; no rollback claim (server lock proven by unit/HTTP)",
    inProgressOk
  );

  // 2) Retry retained with same importId (still in progress)
  await page.locator('[data-testid="plan-import-retry-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-commit-in-progress"]').waitFor({ state: "visible", timeout: 10000 });
  const retained = await page.locator('[data-testid="plan-import-retained-id"]').innerText();
  const retryOk = retained.includes(importId)
    && (await page.locator('[data-testid="plan-import-phase"]').getAttribute("data-plan-import-phase")) === "commit_in_progress";
  await shot(page, "02-retry-retained-importId.png", `Retry retained importId=${importId}`, retryOk);

  // 3) Recovery-required without false rollback
  await page.unroute("**/api/staff/monthly-plans/import/commit").catch(() => {});
  await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "MONTHLY_IMPORT_RECOVERY_REQUIRED",
        recoveryRequired: true,
        compensated: false,
        error: "Uvoz nije potvrđen. Automatski povrat nije uspeo — potrebna je provera (recovery_required)."
      })
    });
  });
  await page.evaluate((item) => {
    window.state.shifts = [];
    window.__setPendingPlanImportsForTest([item]);
  }, pending);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-recovery-required"]').waitFor({ state: "visible", timeout: 10000 });
  const body3 = await page.locator("body").innerText();
  const recoveryOk = await page.locator('[data-testid="plan-import-recovery-required"]').isVisible()
    && body3.includes(importId)
    && !/Partial changes were rolled back|Delimične izmene su poništene|Teiländerungen wurden zurückgenommen/i.test(body3);
  await shot(
    page,
    "03-recovery-required-no-false-rollback.png",
    "Recovery-required UI — identifiers kept; no false rollback toast/text",
    recoveryOk
  );

  // 4) Malicious dynamic fields as plain text
  await page.unroute("**/api/staff/monthly-plans/import/preview").catch(() => {});
  await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        importId,
        fingerprint,
        preview: {
          summary: { rows: 1 },
          rows: [{
            driverId: fixture.state.drivers[0].id,
            date: "2026-08-03",
            type: "morning",
            name: evilDuty,
            bus: evilFile,
            action: "assign"
          }]
        }
      })
    });
  });
  await page.evaluate(({ item, evilFile: fileName }) => {
    window.__setPendingPlanImportsForTest([{ ...item, fileName, driverName: fileName }]);
  }, { item: pending, evilFile });
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible", timeout: 10000 });
  const fileText = await page.locator('[data-testid="plan-import-file-name"]').innerText();
  const imgCount = await page.locator('[data-testid="plan-import-file-name"] img').count();
  const svgCount = await page.locator('[data-testid="plan-import-server-preview"] svg').count();
  const xssOk = fileText.includes("<img src=x onerror=alert(1)>")
    && imgCount === 0
    && svgCount === 0
    && (await page.locator('[data-testid="plan-import-server-preview"]').innerText()).includes(evilDuty);
  await shot(
    page,
    "04-escaped-malicious-fields.png",
    "Malicious fileName/duty rendered as text; no img/svg handlers",
    xssOk
  );
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  await page.screenshot({ path: join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2R-A.2 visual trail",
    "",
    "Real UI screenshots. Visual proves UI path only.",
    "Server single-flight lock, compensation, and auth are proven by unit/HTTP tests.",
    "",
    failed ? "RESULT: FAIL" : "RESULT: PASS",
    ""
  ].join("\n"));
  await browser.close();
}

if (failed) process.exit(1);
console.log("phase-2r-a2 visual OK →", outDir);
