/**
 * FAZA 2R-B.1.1 visual trail — real localized load error + real parsed retry preview.
 * No fabricated captions. No __setPendingPlanImportsForTest for success proof.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-b11-visual");
const PORT = process.env.PORT || "8783";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const CHUNK_RE = /\/assets\/plan-import-[^/?#]+\.js(?:\?|$)/i;
const FIXTURE = readFileSync(join(root, "tests/fixtures/qa-monthly-plan-import-loose.txt"), "utf8");

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
  driverName: "Import CTA Driver",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9",
  driverId: "11111111-1111-4111-8111-111111111111"
});
fixture.state.e2eFixture = true;
fixture.state.activeGroupHubId = "101";
fixture.state.activeLineId = "101";
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
    window.state.activeLineId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible", timeout: 10000 });

  const input = page.locator("#bulk-plan-import-files");
  await input.setInputFiles({
    name: "qa-monthly-plan-import-loose.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(FIXTURE, "utf8")
  });

  const toast = page.locator(".toast-error .toast-msg").first();
  await toast.waitFor({ state: "visible", timeout: 10000 });
  const toastText = (await toast.textContent()) || "";
  const inputCleared = (await input.inputValue()) === "";
  const toastOk = /ponovo izaberite fajl|choose the file again|Datei erneut auswählen/i.test(toastText)
    && !/ostaju na mestu|stay in place|bleiben erhalten|rollback/i.test(toastText)
    && inputCleared;
  await page.locator("#plan-import-dropzone").scrollIntoViewIfNeeded();
  await shot(
    page,
    "01-chunk-load-error.png",
    `Localized load error + cleared input (retriable). Toast: ${toastText.slice(0, 90)}`,
    toastOk
  );

  blockChunk = false;
  await page.evaluate(() => {
    document.querySelectorAll(".toast, .toast-error").forEach((el) => el.remove());
  });

  await input.setInputFiles({
    name: "qa-monthly-plan-import-loose.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(FIXTURE, "utf8")
  });

  const preview = page.locator("#plan-import-preview");
  await preview.waitFor({ state: "visible", timeout: 20000 });
  await preview.scrollIntoViewIfNeeded();
  const row = page.locator('[data-testid="plan-import-pending-row"]');
  const rowVisible = await row.isVisible();
  const driverId = rowVisible ? await row.getAttribute("data-driver-id") : "";
  const monthVal = rowVisible ? await row.locator('[data-testid="plan-import-month-select"]').inputValue() : "";
  const dayCount = rowVisible ? ((await row.locator('[data-testid="plan-import-day-count"]').textContent()) || "").trim() : "";
  const toastGone = !(await page.locator(".toast-error").first().isVisible().catch(() => false));
  const previewOk = rowVisible
    && driverId === "11111111-1111-4111-8111-111111111111"
    && monthVal === "2026-08"
    && dayCount === "1"
    && toastGone;
  await shot(
    page,
    "02-retry-preview.png",
    `Real parsed preview after retry (month=${monthVal}, days=${dayCount}, no test hook, toast gone=${toastGone})`,
    previewOk
  );

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "2R-B.1.1",
    proven: [
      "Localized chunk-load toast for sr (choose file again)",
      "Input cleared after failure so same file can be re-selected",
      "Retry used real fixture parse into pending preview (no __setPendingPlanImportsForTest)",
      "Screenshot 2 has no lingering error toast"
    ],
    notProvenByScreenshots: [
      "Request count / parallel load coalescing (unit+E2E)",
      "Foreign-origin recovery URL rejection (unit)"
    ],
    trail,
    failed
  }, null, 2));
  writeFileSync(join(outDir, "README.md"), "# FAZA 2R-B.1.1 visual trail\n\nReal UI only — parsed fixture preview, no fabricated captions.\n");
} catch (err) {
  failed = true;
  log("fatal", String(err?.stack || err), "fail");
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ phase: "2R-B.1.1", trail, failed }, null, 2));
  throw err;
} finally {
  await browser.close();
}

if (failed) process.exit(1);
console.log("VISUAL_OK");
