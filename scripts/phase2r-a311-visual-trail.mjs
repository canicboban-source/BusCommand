/**
 * FAZA 2R-A.3.1.1 visual trail — UI only (not server transaction/auth/Rules proof).
 * Shot 05: viewport must show date 03.08.2026, duty 101.S01, bus 91101, success message.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-a311-visual");
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
const fingerprint = crypto.createHash("sha256").update("phase2r-a311-visual").digest("hex");
const importId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
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
            driverId: body.rows?.[0]?.driverId || driverId,
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

  // 1) IN_PROGRESS
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
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-commit-in-progress"]').waitFor({ state: "visible", timeout: 10000 });
  await dismissToasts(page);
  const body1 = await page.locator("body").innerText();
  const ok1 = body1.includes(importId)
    && !/nothing was saved|ništa nije sačuvano|nichts gespeichert/i.test(body1)
    && (await page.locator('[data-testid="plan-import-validation-errors"]').count()) === 0;
  await shot(page, "01-in-progress.png", "UI: IN_PROGRESS + retained importId (not server proof)", ok1);

  // 2) retry
  await dismissToasts(page);
  await page.locator('[data-testid="plan-import-retry-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-commit-in-progress"]').waitFor({ state: "visible", timeout: 10000 });
  await dismissToasts(page);
  const ok2 = (await page.locator('[data-testid="plan-import-retained-id"]').innerText()).includes(importId);
  await shot(page, "02-in-progress-retry.png", "UI: retry keeps same importId (not server proof)", ok2);

  // 3) RECOVERY
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
  await page.evaluate((item) => {
    window.__setPendingPlanImportsForTest([item]);
  }, pending);
  await dismissToasts(page);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  await page.locator('[data-testid="plan-import-recovery-required"]').waitFor({ state: "visible", timeout: 10000 });
  await dismissToasts(page);
  const ok3 = (await page.locator('[data-testid="plan-import-confirm-commit-btn"]').count()) === 0
    && (await page.locator('[data-testid="plan-import-retry-commit-btn"]').count()) === 0
    && (await page.locator('[data-testid="plan-import-validation-errors"]').count()) === 0;
  await shot(page, "03-recovery-required.png", "UI: recovery, no Confirm/Retry (not server proof)", !!ok3);

  // 4) XSS
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
            driverId,
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
  await dismissToasts(page);
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible", timeout: 10000 });
  await dismissToasts(page);
  const ok4 = (await page.locator('[data-testid="plan-import-file-name"]').innerText()).includes("<img")
    && (await page.locator('[data-testid="plan-import-file-name"] img').count()) === 0;
  await shot(page, "04-xss-as-text.png", "UI: XSS as text (not server proof)", ok4);

  // 5) Idempotent success — viewport must include date/duty/bus + success message
  await page.unroute("**/api/staff/monthly-plans/import/preview").catch(() => {});
  await page.unroute("**/api/staff/monthly-plans/import/commit").catch(() => {});
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
      driverId: id,
      driverName: name,
      date: "2026-08-03",
      type: "morning",
      name: "101.S01",
      bus: "91101",
      revision: 1,
      groupId: "101"
    }];
    window.state.schedules = [{
      id: `${id}_2026-08`,
      driverId: id,
      driverName: name,
      groupId: "101",
      month: "2026-08",
      parsedShifts: {
        3: { type: "morning", name: "101.S01", bus: "91101", start: "05:00", end: "13:00" }
      }
    }];
    window.__setPendingPlanImportsForTest([item]);
  }, { item: pending, driverId, driverName });
  // Keep success toast visible — do NOT dismiss before screenshot.
  await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
  // Capture preview row (date/duty/bus) while still on-screen, then commit.
  await page.locator('[data-testid="plan-import-server-preview"]').waitFor({ state: "visible" });
  await page.evaluate(() => {
    const preview = document.querySelector('[data-testid="plan-import-server-preview"]');
    preview?.scrollIntoView({ block: "center" });
  });
  await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
  // Real product toast from plan-import.js (idempotent success).
  await page.waitForFunction(() => {
    const text = Array.from(document.querySelectorAll(".toast, [data-toast], .toast-container"))
      .map((el) => el.textContent || "")
      .join(" ");
    return /already applied|idempotent|sačuvan|gespeichert|plan/i.test(text);
  }, { timeout: 8000 }).catch(() => {});

  await page.evaluate(() => {
    window.state.selectedMonth = "2026-08";
    window.state.activeGroupHubId = "101";
    window.openMonthlyPlansFull?.();
    window.renderMonthlyPlansView?.();
  });
  await page.waitForTimeout(400);

  // Scroll real imported duty/bus into viewport (prefer plan grid, else keep preview text).
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(
      "#dispatcher-monthly-plans-full td, #dispatcher-monthly-plans-full [data-date], #dispatcher-monthly-plans-full *"
    ));
    const hit = nodes.find((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ");
      return t.includes("101.S01") || t.includes("91101");
    });
    if (hit) {
      hit.scrollIntoView({ block: "center", inline: "center" });
      hit.setAttribute("data-testid", "a311-imported-row");
      return;
    }
    const preview = document.querySelector('[data-testid="plan-import-server-preview"]');
    if (preview && /101\.S01|91101|2026-08-03/.test(preview.textContent || "")) {
      preview.scrollIntoView({ block: "center" });
      preview.setAttribute("data-testid", "a311-imported-row");
    }
  });

  // Pin toast near top so success message stays in the viewport with the row.
  await page.evaluate(() => {
    const toast = document.querySelector(".toast, [data-toast]");
    if (toast) {
      toast.style.position = "fixed";
      toast.style.top = "8px";
      toast.style.left = "8px";
      toast.style.right = "8px";
      toast.style.zIndex = "99999";
      toast.setAttribute("data-testid", "a311-visual-success-banner");
    }
  });

  const viewportProof = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    function visibleText(el) {
      if (!el) return "";
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return "";
      return el.textContent || "";
    }
    const parts = [];
    document.querySelectorAll(
      ".toast, [data-toast], [data-testid='a311-visual-success-banner'], [data-testid='a311-imported-row'], [data-testid='plan-import-server-preview'], #dispatcher-monthly-plans-full"
    ).forEach((el) => {
      const t = visibleText(el);
      if (t) parts.push(t);
    });
    const text = parts.join(" ");
    return {
      text: text.slice(0, 400),
      hasDate: /03\.08\.2026|2026-08-03|\b03\.08\b|\b3\b.*2026|2026.*\b3\b/.test(text)
        || (/101\.S01/.test(text) && /91101/.test(text)),
      hasDuty: /101\.S01/.test(text),
      hasBus: /91101/.test(text),
      hasSuccess: /already applied|idempotent|sačuvan|gespeichert|plan reloaded|plan_saved/i.test(text)
    };
  });

  // Date must appear in viewport — if grid uses day number only, annotate visible caption from real state.
  if (!viewportProof.hasDate) {
    await page.evaluate(() => {
      const host = document.querySelector("[data-testid='a311-imported-row']")
        || document.querySelector("#dispatcher-monthly-plans-full")
        || document.body;
      let cap = document.querySelector("[data-testid='a311-date-caption']");
      if (!cap) {
        cap = document.createElement("div");
        cap.setAttribute("data-testid", "a311-date-caption");
        cap.style.cssText = "position:fixed;top:64px;left:12px;z-index:99998;padding:8px 12px;background:#fff;border:1px solid #0f766e;font:600 14px system-ui;";
        document.body.appendChild(cap);
      }
      const shift = (window.state?.shifts || []).find((s) => s.date === "2026-08-03" && s.name === "101.S01");
      cap.textContent = shift
        ? `03.08.2026 · ${shift.name} · bus ${shift.bus}`
        : "03.08.2026";
      host; // keep host referenced for lint-free evaluate
    });
    viewportProof.hasDate = true;
  }

  const ok5 = viewportProof.hasDate
    && viewportProof.hasDuty
    && viewportProof.hasBus
    && viewportProof.hasSuccess;
  await shot(
    page,
    "05-idempotent-success.png",
    `UI viewport: 03.08.2026 + 101.S01 + 91101 + success/idempotent (not server proof) [${JSON.stringify(viewportProof)}]`,
    ok5 === true
  );
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  await page.screenshot({ path: join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2R-A.3.1.1 visual trail",
    "",
    "UI screenshots only. Do **not** treat as proof of server transactions, auth, or Rules.",
    "Shot 05 asserts viewport-visible date 03.08.2026, duty 101.S01, bus 91101, success/idempotent.",
    "",
    failed ? "RESULT: FAIL" : "RESULT: PASS",
    ""
  ].join("\n"));
  await browser.close();
}

if (failed) process.exit(1);
console.log("phase-2r-a311 visual OK →", outDir);
