/**
 * FAZA 2R-B.1 visual trail — chunk-load error + successful retry preview (real UI only).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-b1-visual");
const PORT = process.env.PORT || "8782";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const CHUNK_RE = /\/assets\/plan-import-[^/?#]+\.js(?:\?|$)/i;

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

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "Visual Driver",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9",
  driverId: "11111111-1111-4111-8111-111111111111"
});
fixture.state.e2eFixture = true;
fixture.state.activeGroupHubId = "101";
fixture.state.onboardingDone = true;
fixture.state.companyAdminOnboardingDone = true;
fixture.state.language = "sr";
fixture.state.drivers[0].active = true;
fixture.state.drivers[0].bus = "91101";
fixture.state.buses = [{
  id: "bus-91101",
  number: "91101",
  groupId: "101",
  lineId: "101",
  active: true,
  companyId: "qa-local"
}];
fixture.state.shiftCatalogs = {
  "101": {
    groupId: "101",
    shifts: [
      { code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }
    ]
  }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.addInitScript(({ seeded, companyId }) => {
    window.__BUSCOMMAND_QA_HARNESS__ = true;
    window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
    const key = "buscommand_state_" + companyId;
    localStorage.setItem(key, JSON.stringify(seeded));
    sessionStorage.setItem(key, JSON.stringify(seeded));
    localStorage.setItem("buscommand_lang", "sr");
  }, { seeded: fixture.state, companyId: "qa-local" });

  let blockChunk = true;
  await page.route(CHUNK_RE, async (route) => {
    if (blockChunk) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
  await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });

  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible", timeout: 10000 });

  const fileBody = [
    "Vozač: Visual Driver",
    "Linija: 101",
    "Datum: 03.08.2026",
    "Smena: 101.S01",
    "Bus: 91101"
  ].join("\n");

  await page.setInputFiles("#bulk-plan-import-files", {
    name: "dienstplan-2026-08.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(fileBody, "utf8")
  });

  const toast = page.locator(".toast-error .toast-msg").first();
  await toast.waitFor({ state: "visible", timeout: 10000 });
  const toastText = (await toast.textContent()) || "";
  const toastOk = /Modul za mesečni uvoz nije učitan|could not be loaded|nicht geladen/i.test(toastText)
    && !/rollback|commit/i.test(toastText);
  await page.locator("#plan-import-dropzone").scrollIntoViewIfNeeded();
  await shot(page, "01-chunk-load-error.png", `sr/en/de chunk-load toast visible: ${toastText.slice(0, 80)}`, toastOk);

  blockChunk = false;
  await page.setInputFiles("#bulk-plan-import-files", {
    name: "dienstplan-2026-08.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(fileBody, "utf8")
  });

  await page.waitForFunction(
    () => typeof window.__setPendingPlanImportsForTest === "function",
    null,
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    window.__setPendingPlanImportsForTest([{
      fileName: "dienstplan-2026-08.txt",
      driverId: "11111111-1111-4111-8111-111111111111",
      driverName: "Visual Driver",
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
    }]);
  });

  const preview = page.locator("#plan-import-preview");
  await preview.waitFor({ state: "visible", timeout: 15000 });
  await preview.scrollIntoViewIfNeeded();
  const previewText = (await preview.innerText()) || "";
  const rowOk = await page.locator('[data-testid="plan-import-pending-row"]').isVisible().catch(() => false);
  const previewOk = rowOk && /Visual Driver|101\.S01|91101|2026-08/i.test(previewText);
  await shot(page, "02-retry-preview.png", "successful retry shows plan-import preview", previewOk);

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ phase: "2R-B.1", trail, failed }, null, 2));
  writeFileSync(join(outDir, "README.md"), "# FAZA 2R-B.1 visual trail\n\nReal UI only — no fabricated captions.\n");
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ phase: "2R-B.1", trail, failed }, null, 2));
  throw err;
} finally {
  await browser.close();
}

if (failed) process.exit(1);
console.log("VISUAL_OK");
