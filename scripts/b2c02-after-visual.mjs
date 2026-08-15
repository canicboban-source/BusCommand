/**
 * B2C-02 after fix — half-screen + desktop screenshots and layout metrics.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "b2c02-monthly-import-responsive-visual");
const PORT = process.env.PORT || "8772";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const FIXTURE = readFileSync(join(root, "tests/fixtures/qa-monthly-plan-import-loose.txt"), "utf8");
const LONG_NAME = "Aleksandar Petrovic-Milutinovic";

mkdirSync(outDir, { recursive: true });
const trail = [];
function log(step, detail, status = "pass", screenshot = null) {
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

async function runAtViewport(width, height, shotName) {
  const page = await browser.newPage({ viewport: { width, height } });
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
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await page.locator("#plan-import-dropzone").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#bulk-plan-import-files").setInputFiles({
    name: "qa-monthly-plan-import-loose.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8")
  });
  await page.locator('[data-testid="plan-import-pending-row"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="plan-import-pending-row"]').scrollIntoViewIfNeeded();

  const metrics = await page.evaluate((fullName) => {
    const row = document.querySelector('[data-testid="plan-import-pending-row"]');
    const driverName = row?.querySelector('[data-testid="plan-import-driver-name"]');
    const month = row?.querySelector('[data-testid="plan-import-month-select"]');
    const removeBtn = row?.querySelector('[data-testid="plan-import-remove-btn"]');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const inVp = (b) => !!b && b.left >= -1 && b.top >= -1 && b.right <= vp.w + 1 && b.bottom <= vp.h + 1;
    return {
      vp,
      driverText: (driverName?.textContent || "").trim(),
      fullNameVisible: (driverName?.textContent || "").includes(fullName),
      monthValue: month?.value || "",
      monthText: month?.selectedOptions?.[0]?.textContent?.trim() || "",
      monthAria: month?.getAttribute("aria-label") || "",
      nativeMonth: !!(row && row.querySelector('input[type="month"]')),
      driverBox: box(driverName),
      monthBox: box(month),
      removeBox: box(removeBtn),
      driverInViewport: inVp(box(driverName)),
      monthInViewport: inVp(box(month)),
      removeInViewport: inVp(box(removeBtn))
    };
  }, LONG_NAME);

  const overlap = metrics.driverBox && metrics.monthBox
    ? boxesOverlap(metrics.driverBox, metrics.monthBox)
    : true;
  const ok = metrics.fullNameVisible
    && !metrics.nativeMonth
    && metrics.monthValue === "2026-08"
    && metrics.monthText === "avg 2026"
    && metrics.driverInViewport
    && metrics.monthInViewport
    && metrics.removeInViewport
    && !overlap
    && metrics.monthBox.width < metrics.driverBox.width;

  await page.screenshot({ path: join(outDir, shotName), fullPage: false });
  log(shotName, JSON.stringify({
    vp: metrics.vp,
    driverText: metrics.driverText,
    monthText: metrics.monthText,
    monthW: Math.round(metrics.monthBox?.width || 0),
    driverW: Math.round(metrics.driverBox?.width || 0),
    overlap,
    ok
  }), ok ? "pass" : "fail", shotName);

  await page.close();
  return { metrics, overlap, ok };
}

try {
  const half = await runAtViewport(720, 900, "01-after-half-screen.png");
  const desk = await runAtViewport(1440, 900, "02-after-desktop.png");
  writeFileSync(join(outDir, "AFTER.json"), JSON.stringify({ trail, half, desk }, null, 2));
  writeFileSync(join(outDir, "TRAIL.md"), [
    "# B2C-02 visual trail",
    "",
    "## Fail-first (before)",
    "- See `FAIL-FIRST.md` + `00-fail-first-half-screen-before.png`",
    "",
    "## After",
    `- Half-screen ok: ${half.ok}`,
    `- Desktop ok: ${desk.ok}`,
    "- Screenshots: `01-after-half-screen.png`, `02-after-desktop.png`",
    ""
  ].join("\n"));
  if (!half.ok || !desk.ok) process.exitCode = 1;
} catch (err) {
  log("error", String(err && err.stack || err), "fail");
  process.exitCode = 1;
} finally {
  await browser.close();
}
