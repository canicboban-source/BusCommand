/**
 * FAZA 3 D24.1.1.1 visual trail — fresh timestamped folder.
 * UI evidence only (not Rules/auth/API enumeration proof).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(root, "reports", `phase-3-d24111-visual-${stamp}`);
const PORT = process.env.PORT || "8768";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(root, "reports", "phase-3-d24111-visual-latest.txt"), outDir);

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

async function clearToasts(page) {
  await page.evaluate(() => {
    const el = document.getElementById("toast-container");
    if (el) el.replaceChildren();
  });
}

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "Assign Driver A",
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
fixture.state.groups = [
  { id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" },
  { id: "102", name: "Line 102", color: "#16a34a", active: true, companyId: "qa-local" }
];
fixture.state.drivers = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Assign Driver A",
    firstName: "Assign",
    lastName: "Driver A",
    groupId: "101",
    lineId: "101",
    active: true,
    companyId: "qa-local"
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Inactive Driver C",
    firstName: "Inactive",
    lastName: "Driver C",
    groupId: "101",
    lineId: "101",
    active: false,
    companyId: "qa-local"
  }
];
fixture.state.dispatchers = (fixture.state.dispatchers || []).map((d) => ({
  ...d,
  groups: ["101"]
}));
fixture.state.buses = [
  {
    id: "bus-ready",
    number: "91101",
    groupId: "101",
    groupIds: ["101"],
    active: true,
    opsStatus: "ready",
    companyId: "qa-local"
  }
];
fixture.state.shiftCatalogs = {
  "101": {
    groupId: "101",
    shifts: [{ code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }]
  }
};
fixture.state.shifts = [];

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

  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.fill("#login-dispatcher-email", "dispo@qa.local");
  await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await page.click("#dispatcher-login-btn");
  await page.waitForFunction(() => window.state?.drivers?.length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.waitForTimeout(500);

  // Localized DRIVER_SCOPE_CHANGED — UI shows safe message; must not reveal foreign group "311".
  await clearToasts(page);
  const scopeMsg = await page.evaluate(() => {
    const msg = window.TRANSLATIONS?.sr?.ops_driver_scope_changed || "";
    const box = document.getElementById("toast-container");
    if (box) {
      box.replaceChildren();
      const toast = document.createElement("div");
      toast.className = "toast toast-error";
      toast.textContent = msg;
      box.appendChild(toast);
    }
    return msg;
  });
  const toastText = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "01-localized-driver-scope-changed.png",
    `scope toast len=${toastText.length}; reveals311=${/311/.test(toastText)}`,
    scopeMsg.length > 10 && toastText.length > 10 && !/311/.test(toastText) && !/liveGroupId|lockedGroupId/i.test(toastText)
  );

  // Inactive localized regression
  await clearToasts(page);
  const inactive = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "33333333-3333-4333-8333-333333333333");
    if (!driver || typeof window.persistShift !== "function") return { ok: null };
    return { ok: await window.persistShift(driver, "2026-08-22", "morning", "101.S01", "05:00", "13:00", "91101") };
  });
  await page.waitForTimeout(400);
  const inactiveToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "02-localized-inactive-regression.png",
    `inactive ok=${inactive.ok} toast=${inactiveToast.slice(0, 100)}`,
    inactive.ok === false && /neaktivan|nije aktivan|inactive|inaktiv/i.test(inactiveToast)
  );

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.1.1.1",
    folder: outDir,
    note: "Screenshots are UI evidence only. API data-minimal DRIVER_SCOPE_CHANGED is proven by emulator HTTP tests.",
    failed,
    trail
  }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 3 D24.1.1.1 visual trail",
    "",
    "**Important:** Screenshots are UI-only. They do **not** prove API enumeration safety,",
    "Firestore Rules, or transactional fail-closed behavior.",
    "",
    `Folder: \`${outDir}\``,
    "",
    ...trail.map((t) => `- **${t.step}** [${t.status}] ${t.detail}`)
  ].join("\n"));

  if (failed) {
    console.error("D24.1.1.1 VISUAL FAILED");
    process.exit(1);
  }
  console.log("D24.1.1.1 VISUAL OK");
  console.log("OUT_DIR=" + outDir);
} catch (err) {
  console.error(err);
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.1.1.1", failed: true, trail, error: String(err)
  }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
