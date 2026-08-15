/**
 * FAZA 2R-B visual trail — real UI only (no fabricated captions/banners).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-b-visual");
const PORT = process.env.PORT || "8781";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

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
    log(name, `assertion failed: ${note}`, "fail", null);
    await page.screenshot({ path: join(outDir, `FAIL-${name}`), fullPage: false }).catch(() => {});
    return false;
  }
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  log(name, note, "pass", name);
  return true;
}

async function dismissToasts(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".toast, .toast-container, [data-toast]").forEach((el) => el.remove());
  }).catch(() => {});
}

async function visibleHas(page, re) {
  return page.evaluate((pattern) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const rx = new RegExp(pattern, "i");
    const nodes = Array.from(document.querySelectorAll("body *"));
    return nodes.some((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return false;
      return rx.test(el.textContent || "");
    });
  }, re.source || re);
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

const driverId = fixture.state.drivers[0].id;
const driverName = fixture.state.drivers[0].name || "Visual Driver";
const fingerprint = crypto.createHash("sha256").update("phase2r-b-visual").digest("hex");
const importId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(({ seeded, companyId }) => {
  window.__BUSCOMMAND_QA_HARNESS__ = true;
  window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
  const key = "buscommand_state_" + companyId;
  localStorage.setItem(key, JSON.stringify(seeded));
  sessionStorage.setItem(key, JSON.stringify(seeded));
  localStorage.setItem("buscommand_lang", "en");
}, { seeded: fixture.state, companyId: "qa-local" });

try {
  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").waitFor({ state: "visible", timeout: 15000 });
  await shot(page, "01-staff-initial.png", "Staff login / initial screen", true);

  const langSelect = page.locator("#login-lang-select");
  await langSelect.waitFor({ state: "visible" });
  const opts = await langSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((n) => n.value).sort()
  );
  await langSelect.focus();
  const okLang = JSON.stringify(opts) === JSON.stringify(["de", "en", "sr"]);
  await shot(page, "02-language-selector.png", `Login language options ${JSON.stringify(opts)}`, okLang);

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
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#plan-import-dropzone").scrollIntoViewIfNeeded();
  await shot(page, "03-monthly-import-cta.png", "Monthly import CTA + upload zone", true);

  const pending = {
    fileName: "visual.txt",
    driverId,
    driverName,
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
            driverId,
            date: "2026-08-03",
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
  await dismissToasts(page);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="plan-import-server-preview"]').scrollIntoViewIfNeeded();
  const okPreview = await visibleHas(page, /101\.S01|91101|2026-08-03/);
  await shot(page, "04-server-preview.png", "Server preview with duty/bus/date", okPreview);

  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-commit-in-progress"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="plan-import-commit-in-progress"]').scrollIntoViewIfNeeded();
  const okProg = (await page.locator('[data-testid="plan-import-retry-commit-btn"]').count()) > 0
    && (await page.locator('[data-testid="plan-import-retained-id"]').innerText()).includes(importId);
  await shot(page, "05-in-progress-retry.png", "IN_PROGRESS + retry retained importId", okProg);

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
        error: "Uvoz nije potvrđen. Stanje zahteva proveru — plan se ne smatra čistim."
      })
    });
  });
  await page.evaluate((item) => { window.__setPendingPlanImportsForTest([item]); }, pending);
  await dismissToasts(page);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-recovery-required"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="plan-import-recovery-required"]').scrollIntoViewIfNeeded();
  const okRec = (await page.locator('[data-testid="plan-import-confirm-commit-btn"]').count()) === 0
    && (await page.locator('[data-testid="plan-import-retry-commit-btn"]').count()) === 0;
  await shot(page, "06-recovery-required.png", "RECOVERY without Confirm/Retry", okRec);

  await page.unroute("**/api/staff/monthly-plans/import/commit").catch(() => {});
  await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        importId,
        summary: { rows: 1 },
        idempotent: true
      })
    });
  });
  await page.evaluate(({ item, driverId: id, driverName: name }) => {
    window.loadStateFromFirestore = async () => ({
      shifts: [{
        driverId: id,
        driverName: name,
        date: "2026-08-03",
        type: "morning",
        name: "101.S01",
        bus: "91101",
        revision: 1,
        groupId: "101"
      }],
      schedules: [{
        id: `${id}_2026-08`,
        driverId: id,
        driverName: name,
        groupId: "101",
        month: "2026-08",
        parsedShifts: {
          3: { type: "morning", name: "101.S01", bus: "91101", start: "05:00", end: "13:00" }
        }
      }]
    });
    window.state.shifts = [{
      driverId: id, driverName: name, date: "2026-08-03", type: "morning",
      name: "101.S01", bus: "91101", revision: 1, groupId: "101"
    }];
    window.state.schedules = [{
      id: `${id}_2026-08`, driverId: id, driverName: name, groupId: "101", month: "2026-08",
      parsedShifts: { 3: { type: "morning", name: "101.S01", bus: "91101", start: "05:00", end: "13:00" } }
    }];
    window.__setPendingPlanImportsForTest([item]);
  }, { item: pending, driverId, driverName });
  await dismissToasts(page);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.waitForFunction(() => {
    const text = Array.from(document.querySelectorAll(".toast, [data-toast], .toast-container"))
      .map((el) => el.textContent || "").join(" ");
    return /already applied|idempotent|sačuvan|gespeichert|plan reloaded|ponovo učitan|neu geladen/i.test(text);
  }, { timeout: 8000 }).catch(() => {});

  await page.evaluate(() => {
    window.state.selectedMonth = "2026-08";
    window.state.activeGroupHubId = "101";
    window.openMonthlyPlansFull?.();
    window.renderMonthlyPlansView?.();
  });
  await page.waitForTimeout(500);

  // Scroll real imported row into viewport — fail if product UI lacks the data.
  const found = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(
      "#dispatcher-monthly-plans-full td, #dispatcher-monthly-plans-full *"
    ));
    const hit = nodes.find((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ");
      return t.includes("101.S01") || t.includes("91101");
    });
    if (!hit) return false;
    hit.scrollIntoView({ block: "center", inline: "center" });
    return true;
  });
  const toast = page.locator(".toast, [data-toast]").first();
  if (await toast.count()) {
    await toast.evaluate((el) => {
      el.style.position = "fixed";
      el.style.top = "8px";
      el.style.left = "8px";
      el.style.zIndex = "99999";
    }).catch(() => {});
  }
  const okSuccess = found
    && await visibleHas(page, /03\.08\.2026|2026-08-03/)
    && await visibleHas(page, /101\.S01/)
    && await visibleHas(page, /91101/)
    && await visibleHas(page, /already applied|idempotent|sačuvan|gespeichert|plan reloaded|ponovo učitan|neu geladen/);
  await shot(
    page,
    "07-idempotent-success.png",
    "Idempotent success with visible date/duty/bus/toast (real UI)",
    okSuccess
  );
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  await page.screenshot({ path: join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2R-B visual trail",
    "",
    "Real UI screenshots only. No fabricated captions/banners.",
    "",
    failed ? "RESULT: FAIL" : "RESULT: PASS",
    ""
  ].join("\n"));
  await browser.close();
}

if (failed) process.exit(1);
console.log("phase-2r-b visual OK →", outDir);
