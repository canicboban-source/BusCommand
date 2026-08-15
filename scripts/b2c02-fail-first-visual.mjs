/**
 * B2C-02 fail-first — prove Driver squeeze vs wide Month (input[type=month]) at half-screen.
 * Real file-input → preview. Does not mutate product code.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "b2c02-monthly-import-responsive-visual");
const PORT = process.env.PORT || "8766";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const FIXTURE = readFileSync(join(root, "tests/fixtures/qa-monthly-plan-import-loose.txt"), "utf8");
const LONG_NAME = "Aleksandar Petrovic-Milutinovic";

mkdirSync(outDir, { recursive: true });

const trail = [];
function log(step, detail, status = "info", screenshot = null) {
  trail.push({ step, detail, status, screenshot, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
}

function boxesOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: LONG_NAME,
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
fixture.state.drivers[0].name = LONG_NAME;
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
    shifts: [{ code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }]
  }
};

const body = FIXTURE.replace("Import CTA Driver", LONG_NAME);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 900 } });

try {
  await page.addInitScript(({ seeded, companyId }) => {
    window.__BUSCOMMAND_QA_HARNESS__ = true;
    window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
    const key = "buscommand_state_" + companyId;
    localStorage.setItem(key, JSON.stringify(seeded));
    sessionStorage.setItem(key, JSON.stringify(seeded));
    localStorage.setItem("buscommand_lang", "sr");
  }, { seeded: fixture.state, companyId: "qa-local" });

  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
  await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });

  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });

  const importBtn = page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first();
  await importBtn.click();
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible", timeout: 15000 });

  await page.locator("#bulk-plan-import-files").setInputFiles({
    name: "qa-monthly-plan-import-loose.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8")
  });

  await page.locator('[data-testid="plan-import-pending-row"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="plan-import-pending-row"]').scrollIntoViewIfNeeded();

  const shotPath = join(outDir, "00-fail-first-half-screen-before.png");
  await page.screenshot({ path: shotPath, fullPage: false });
  log("screenshot", "half-screen preview before fix", "info", "00-fail-first-half-screen-before.png");

  const metrics = await page.evaluate((fullName) => {
    const row = document.querySelector('[data-testid="plan-import-pending-row"]');
    const driver = row?.querySelector('[data-testid="plan-import-driver-select"]');
    const month = row?.querySelector('input[type="month"], [data-testid="plan-import-month-select"]');
    const file = row?.querySelector('[data-testid="plan-import-file-name"]');
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const driverBox = box(driver);
    const monthBox = box(month);
    const fileBox = box(file);
    const selectedText = driver?.selectedOptions?.[0]?.textContent?.trim() || "";
    const visibleText = selectedText;
    const truncated = !visibleText.includes(fullName)
      || (driver && driver.scrollWidth > driver.clientWidth + 1);
    const monthIsNative = !!(row && row.querySelector('input[type="month"]'));
    return {
      vp,
      driverBox,
      monthBox,
      fileBox,
      selectedText,
      truncated,
      monthIsNative,
      monthWidth: monthBox?.width || 0,
      driverWidth: driverBox?.width || 0,
      driverInViewport: driverBox
        ? driverBox.left >= 0 && driverBox.right <= vp.w + 1 && driverBox.top >= 0 && driverBox.bottom <= vp.h + 1
        : false,
      monthInViewport: monthBox
        ? monthBox.left >= 0 && monthBox.right <= vp.w + 1 && monthBox.top >= 0 && monthBox.bottom <= vp.h + 1
        : false
    };
  }, LONG_NAME);

  const overlap = metrics.driverBox && metrics.monthBox
    ? boxesOverlap(metrics.driverBox, metrics.monthBox)
    : false;

  log("metrics", JSON.stringify(metrics), "info");
  log("overlap", String(overlap), overlap ? "fail" : "info");

  const problem =
    metrics.monthIsNative
    || metrics.truncated
    || metrics.monthWidth > metrics.driverWidth
    || !metrics.driverInViewport
    || overlap;

  if (problem) {
    log(
      "fail-first",
      `PROVEN: nativeMonth=${metrics.monthIsNative} truncated=${metrics.truncated} monthW=${Math.round(metrics.monthWidth)} driverW=${Math.round(metrics.driverWidth)} inVp=${metrics.driverInViewport} overlap=${overlap}`,
      "fail",
      "00-fail-first-half-screen-before.png"
    );
  } else {
    log("fail-first", "Problem NOT reproduced at this viewport — unexpected", "pass");
  }

  writeFileSync(join(outDir, "FAIL-FIRST.json"), JSON.stringify({ trail, metrics, overlap, problem }, null, 2));
  writeFileSync(join(outDir, "FAIL-FIRST.md"), [
    "# B2C-02 fail-first",
    "",
    `- Viewport: ${metrics.vp.w}×${metrics.vp.h}`,
    `- Native month input: ${metrics.monthIsNative}`,
    `- Driver selected text: \`${metrics.selectedText}\``,
    `- Driver truncated / incomplete: ${metrics.truncated}`,
    `- Month width: ${Math.round(metrics.monthWidth)}px`,
    `- Driver width: ${Math.round(metrics.driverWidth)}px`,
    `- Driver in viewport: ${metrics.driverInViewport}`,
    `- Overlap Driver/Month: ${overlap}`,
    `- Screenshot: \`00-fail-first-half-screen-before.png\``,
    `- Verdict: ${problem ? "FAIL (problem proven)" : "UNEXPECTED PASS"}`,
    ""
  ].join("\n"));

  console.log(problem ? "FAIL_FIRST_PROVEN=1" : "FAIL_FIRST_PROVEN=0");
  process.exitCode = 0;
} catch (err) {
  log("error", String(err && err.stack || err), "fail");
  writeFileSync(join(outDir, "FAIL-FIRST.json"), JSON.stringify({ trail, error: String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
